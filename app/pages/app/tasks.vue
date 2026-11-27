<script setup lang="ts">
import { CheckSquare, GitBranch, Plus, RefreshCw } from 'lucide-vue-next';
import type { AdoSelectedWorkItem } from '~/components/ado/AdoWorkItemPickerPopover.vue';
import {
  buildAdoSyncCandidates,
  parseWorkItemIdInput,
  resolveEffectiveProjectAdoTarget,
  secondsToHours2,
} from '~/domain/ado';
import { formatHMS } from '~/domain/duration';
import {
  MAX_TASK_DEPTH,
  UNASSIGNED_PROJECT_ID,
  collectDescendantTaskIds,
} from '~/domain/invariants';
import type { EntityId, Project, Task, TaskStatus } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timeLogsStore = useTimeLogsStore();
const timerStore = useTimerStore();
const adoStore = useAdoStore();

const selectedProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);

// New Task form state
const newTaskName = ref('');
const newTaskDescription = ref('');
const newTaskParentId = ref<EntityId>('');
const newTaskTargetHours = ref('');
const newTaskAdoItem = ref<AdoSelectedWorkItem | null>(null);
const taskNameInputRef = ref<HTMLInputElement | null>(null);

// Modals & Confirmation state
const syncReviewOpen = ref(false);
const createAdoDialogOpen = ref(false);
const createAdoTargetTask = ref<Task | null>(null);
const refreshingAdo = ref(false);

const pendingDeleteTask = ref<{
  taskId: EntityId;
  name: string;
  descendantCount: number;
} | null>(null);
const isDeleting = ref(false);

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timeLogsStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    adoStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
  const preferred =
    catalogStore.sortedProjects.find((p) => p.systemKey !== 'unassigned') ??
    catalogStore.sortedProjects[0];
  if (preferred) {
    selectedProjectId.value = preferred.id;
  }
});

const selectedProject = computed(() =>
  catalogStore.getProjectById(selectedProjectId.value)
);

const effectiveAdoTarget = computed(() =>
  resolveEffectiveProjectAdoTarget(selectedProject.value, adoStore.connection)
);

const taskTreeRoots = computed(() =>
  catalogStore.getTaskTreeForProject(selectedProjectId.value)
);

const flattenedTasks = computed(() =>
  catalogStore.getFlattenedTasksForProject(selectedProjectId.value)
);

const eligibleParentTasks = computed(() =>
  flattenedTasks.value.filter((node) => node.depth < MAX_TASK_DEPTH)
);

// Rolled-up tracked seconds per Task (including descendants)
const trackedSecondsByTask = computed(() => {
  const direct = new Map<EntityId, number>();
  for (const log of timeLogsStore.logs) {
    if (!log.taskId) continue;
    direct.set(log.taskId, (direct.get(log.taskId) ?? 0) + log.durationSeconds);
  }
  const rolledUp = new Map<EntityId, number>();
  for (const task of catalogStore.tasks) {
    const ids = collectDescendantTaskIds(task.id, catalogStore.tasks);
    let sum = 0;
    for (const id of ids) {
      sum += direct.get(id) ?? 0;
    }
    if (sum > 0) rolledUp.set(task.id, sum);
  }
  return rolledUp;
});

const syncCandidates = computed(() =>
  buildAdoSyncCandidates({
    projects: catalogStore.projects,
    tasks: catalogStore.tasks,
    logs: timeLogsStore.logs,
    connection: adoStore.connection,
  })
);

const unsyncedHoursByTask = computed(() => {
  const map = new Map<EntityId, number>();
  for (const item of syncCandidates.value.readyItems) {
    for (const t of item.tasks) {
      map.set(t.id, (map.get(t.id) ?? 0) + item.recommendedDeltaHours);
    }
  }
  return map;
});

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function projectTaskCount(projectId: EntityId): number {
  return catalogStore.getTasksForProject(projectId).length;
}

function projectUnsyncedHours(projectId: EntityId): number {
  let secs = 0;
  for (const item of syncCandidates.value.readyItems) {
    if (item.primaryTask.projectId === projectId) {
      secs += item.unsyncedSeconds;
    }
  }
  return secondsToHours2(secs);
}

function selectProject(projectId: EntityId) {
  selectedProjectId.value = projectId;
  newTaskParentId.value = '';
  newTaskAdoItem.value = null;
}

async function handleCreateTask() {
  if (!authStore.user || !selectedProject.value || !newTaskName.value.trim()) return;
  const hours = Number(newTaskTargetHours.value);
  await catalogStore.createTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    parentTaskId: newTaskParentId.value || null,
    name: newTaskName.value,
    description: newTaskDescription.value,
    targetHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
    ...(newTaskAdoItem.value
      ? {
          externalWorkItemId: String(newTaskAdoItem.value.id),
          externalWorkItemTitle: newTaskAdoItem.value.title,
          externalWorkItemType: newTaskAdoItem.value.workItemType,
          externalWorkItemUrl: newTaskAdoItem.value.url,
          externalOrgUrl: newTaskAdoItem.value.orgUrl,
          externalProject: newTaskAdoItem.value.project,
          completedWorkHours: newTaskAdoItem.value.completedWork,
          externalSyncedAt: new Date().toISOString(),
        }
      : {}),
  });
  newTaskName.value = '';
  newTaskDescription.value = '';
  newTaskParentId.value = '';
  newTaskTargetHours.value = '';
  newTaskAdoItem.value = null;
}

function prefillParentForSubtask(parentId: EntityId) {
  newTaskParentId.value = parentId;
  nextTick(() => {
    taskNameInputRef.value?.focus();
  });
}

async function handleReorder(payload: { taskId: EntityId; targetIndex: number }) {
  if (!authStore.user) return;
  await catalogStore.reorderTaskSiblings({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    targetIndex: payload.targetIndex,
  });
}

async function handleStartTimerFromTask(taskId: EntityId) {
  if (!authStore.user) return;
  await timerStore.startTimerFromTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId,
  });
  await navigateTo(localePath('/app'));
}

async function handleCycleStatus(payload: { taskId: EntityId; current: TaskStatus }) {
  if (!authStore.user) return;
  const next: TaskStatus =
    payload.current === 'todo'
      ? 'in_progress'
      : payload.current === 'in_progress'
        ? 'done'
        : 'todo';
  await catalogStore.updateTaskStatus({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    status: next,
  });
}

async function handleSaveEdit(payload: {
  taskId: EntityId;
  name: string;
  description: string;
  targetHours: number | null;
}) {
  if (!authStore.user) return;
  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    name: payload.name,
    description: payload.description,
    targetHours: payload.targetHours,
  });
}

async function handleLinkAdo(payload: { task: Task; adoItem: AdoSelectedWorkItem | null }) {
  if (!authStore.user) return;
  if (!payload.adoItem) {
    await catalogStore.updateTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: payload.task.id,
      name: payload.task.name,
      description: payload.task.description,
      targetHours: payload.task.targetHours ?? null,
      externalWorkItemId: null,
      completedWorkHours: 0,
    });
    return;
  }

  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.task.id,
    name: payload.task.name,
    description: payload.task.description,
    targetHours: payload.task.targetHours ?? null,
    externalWorkItemId: String(payload.adoItem.id),
    externalWorkItemTitle: payload.adoItem.title,
    externalWorkItemType: payload.adoItem.workItemType,
    externalWorkItemUrl: payload.adoItem.url,
    externalOrgUrl: payload.adoItem.orgUrl,
    externalProject: payload.adoItem.project,
    completedWorkHours: payload.adoItem.completedWork,
    externalSyncedAt: new Date().toISOString(),
  });
}

function openCreateAdoModal(task: Task) {
  createAdoTargetTask.value = task;
  createAdoDialogOpen.value = true;
}

const createAdoDirectLogs = computed(() => {
  if (!createAdoTargetTask.value) return [];
  const descendantIds = new Set(
    collectDescendantTaskIds(createAdoTargetTask.value.id, catalogStore.tasks)
  );
  return timeLogsStore.logs.filter((l) => l.taskId && descendantIds.has(l.taskId));
});

const createAdoUnsyncedSeconds = computed(() =>
  createAdoDirectLogs.value.reduce((sum, l) => sum + l.durationSeconds, 0)
);

async function handleRefreshProjectAdo() {
  if (!authStore.user || !adoStore.isConnected || refreshingAdo.value) return;
  const linked = catalogStore.getTasksForProject(selectedProjectId.value).filter(
    (t) => t.externalProvider === 'azure_devops' && t.externalWorkItemId
  );
  if (linked.length === 0) return;

  refreshingAdo.value = true;
  try {
    const groupsMap = new Map<string, { orgUrl: string; project: string; ids: number[] }>();
    for (const t of linked) {
      const id = parseWorkItemIdInput(t.externalWorkItemId);
      if (!id) continue;
      const orgUrl = t.externalOrgUrl || effectiveAdoTarget.value?.orgUrl || adoStore.connection!.orgUrl;
      const project = t.externalProject || effectiveAdoTarget.value?.project || adoStore.connection!.defaultProject;
      const key = `${orgUrl.toLowerCase()}::${project.toLowerCase()}`;
      let grp = groupsMap.get(key);
      if (!grp) {
        grp = { orgUrl, project, ids: [] };
        groupsMap.set(key, grp);
      }
      if (!grp.ids.includes(id)) grp.ids.push(id);
    }
    await adoStore.pullWorkItems({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      targets: Array.from(groupsMap.values()),
    });
  } finally {
    refreshingAdo.value = false;
  }
}

function requestDeleteTask(task: Task) {
  const ids = collectDescendantTaskIds(task.id, catalogStore.tasks);
  pendingDeleteTask.value = {
    taskId: task.id,
    name: task.name,
    descendantCount: Math.max(0, ids.length - 1),
  };
}

const confirmDeleteDesc = computed(() => {
  const target = pendingDeleteTask.value;
  if (!target) return '';
  if (target.descendantCount > 0) {
    return t('confirm.deleteTaskCascadeDesc', {
      name: target.name,
      descendantCount: target.descendantCount,
    });
  }
  return t('confirm.deleteTaskDesc', { name: target.name });
});

async function confirmDeleteTask() {
  if (!authStore.user || !pendingDeleteTask.value || isDeleting.value) return;
  isDeleting.value = true;
  try {
    await catalogStore.deleteTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: pendingDeleteTask.value.taskId,
    });
    pendingDeleteTask.value = null;
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header & Azure DevOps Sync Trigger -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
            {{ $t('tasks.title') }}
          </h1>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('tasks.subtitle') }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="adoStore.isConnected"
            type="button"
            :disabled="refreshingAdo"
            class="btn-press inline-flex h-10 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:border-signal transition-colors disabled:opacity-50"
            @click="handleRefreshProjectAdo"
          >
            <RefreshCw class="h-3.5 w-3.5 text-signal" :class="refreshingAdo ? 'animate-spin' : ''" aria-hidden="true" />
            <span>{{ $t('tasks.refreshAdoButton') }}</span>
          </button>

          <button
            v-if="adoStore.isConnected"
            type="button"
            data-testid="tasks-open-ado-sync"
            class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            @click="syncReviewOpen = true"
          >
            <GitBranch class="h-4 w-4" aria-hidden="true" />
            <span>{{ $t('tasks.syncAdoButton') }}</span>
            <span
              v-if="syncCandidates.totalRecommendedHours > 0"
              class="tabular-telemetry border border-white/30 bg-white/15 px-1.5 py-0.5 text-xs"
            >
              +{{ syncCandidates.totalRecommendedHours.toFixed(2) }}h
            </span>
          </button>

          <NuxtLink
            v-else
            :to="localePath('/app/settings#azure-devops')"
            class="btn-press inline-flex h-10 items-center gap-2 border border-signal/50 bg-signal-soft px-4 text-xs font-semibold uppercase tracking-wider text-signal hover:bg-accent hover:text-white transition-colors"
          >
            <GitBranch class="h-4 w-4" aria-hidden="true" />
            <span>{{ $t('tasks.connectAdoCta') }}</span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Project Filter Column -->
      <div class="lg:col-span-4 space-y-4">
        <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5">
          <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div class="label-eyebrow border-b border-border-hairline pb-3 text-signal">
            {{ $t('tasks.projectScopeTitle') }}
          </div>

          <ul class="mt-3 divide-y divide-border-hairline">
            <li v-for="proj in catalogStore.sortedProjects" :key="proj.id">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 px-3 py-3 text-left transition-colors"
                :class="
                  selectedProjectId === proj.id
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-primary'
                "
                @click="selectProject(proj.id)"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span
                    class="h-3 w-3 shrink-0"
                    :style="{ backgroundColor: proj.color }"
                  />
                  <span class="truncate text-sm font-medium text-text-primary">
                    {{ displayProjectName(proj) }}
                  </span>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="adoStore.isConnected && projectUnsyncedHours(proj.id) > 0"
                    class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-500"
                  >
                    +{{ projectUnsyncedHours(proj.id).toFixed(2) }}h
                  </span>
                  <span class="tabular-telemetry border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted">
                    {{ projectTaskCount(proj.id) }}
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Task Hierarchy & Priority Drag-and-Drop Column -->
      <div v-if="selectedProject" class="lg:col-span-8 space-y-5">
        <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
          <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
            <div class="label-eyebrow flex items-center gap-2 text-signal">
              <CheckSquare class="h-4 w-4" aria-hidden="true" />
              <span>{{ displayProjectName(selectedProject) }} · {{ $t('tasks.hierarchyTitle') }} ({{ flattenedTasks.length }})</span>
            </div>
            <span class="text-xs text-text-muted">
              {{ $t('tasks.dragReorderHint') }}
            </span>
          </div>

          <!-- Create Task / Subtask Form -->
          <form class="mt-4 space-y-2.5" @submit.prevent="handleCreateTask">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                ref="taskNameInputRef"
                v-model="newTaskName"
                type="text"
                required
                data-testid="tasks-new-name-input"
                :placeholder="$t('catalog.newTaskPlaceholder')"
                class="sm:col-span-4 h-10 border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
              />
              <select
                v-model="newTaskParentId"
                :aria-label="$t('catalog.parentTaskLabel')"
                class="sm:col-span-3 h-10 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
              >
                <option value="">{{ $t('catalog.parentTaskNone') }}</option>
                <option
                  v-for="parentNode in eligibleParentTasks"
                  :key="parentNode.task.id"
                  :value="parentNode.task.id"
                >
                  {{ parentNode.depth === 1 ? '↳ ' : '' }}{{ parentNode.task.name }}
                </option>
              </select>
              <input
                v-model="newTaskTargetHours"
                type="number"
                min="0"
                step="0.5"
                :placeholder="$t('catalog.targetHoursPlaceholder')"
                class="tabular-telemetry sm:col-span-2 h-10 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
              />
              <div class="sm:col-span-3">
                <AdoWorkItemPickerPopover
                  variant="field"
                  :work-item-id="newTaskAdoItem ? String(newTaskAdoItem.id) : undefined"
                  :work-item-title="newTaskAdoItem?.title"
                  :org-url="effectiveAdoTarget?.orgUrl"
                  :project="effectiveAdoTarget?.project"
                  @select="newTaskAdoItem = $event"
                />
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <textarea
                v-model="newTaskDescription"
                rows="2"
                :placeholder="$t('catalog.taskDescriptionPlaceholder')"
                class="flex-1 border border-border-input bg-bg-primary p-3 text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
              />
              <button
                type="submit"
                data-testid="tasks-create-submit"
                class="btn-press inline-flex h-10 sm:h-auto sm:w-40 shrink-0 items-center justify-center gap-1.5 bg-accent px-3.5 text-xs font-semibold uppercase text-white hover:bg-accent-hover transition-colors"
              >
                <Plus class="h-4 w-4" aria-hidden="true" />
                <span>{{ $t('catalog.addTask') }}</span>
              </button>
            </div>
          </form>

          <!-- Empty State -->
          <div v-if="taskTreeRoots.length === 0" class="mt-5 border border-border-hairline bg-bg-primary p-6 text-center text-ui text-text-muted">
            {{ $t('catalog.noTasksYet') }}
          </div>

          <!-- Draggable 3-Level Sibling Priority Tree -->
          <div v-else class="mt-5">
            <TasksTaskTreeLevel
              :nodes="taskTreeRoots"
              :depth="0"
              :running-task-id="timerStore.isRunning ? timerStore.taskId : null"
              :tracked-seconds-by-task="trackedSecondsByTask"
              :unsynced-hours-by-task="unsyncedHoursByTask"
              :ado-connected="adoStore.isConnected"
              :ado-org-url="effectiveAdoTarget?.orgUrl"
              :ado-project="effectiveAdoTarget?.project"
              :ado-enabled-for-project="Boolean(effectiveAdoTarget?.enabled)"
              @reorder="handleReorder"
              @start-timer="handleStartTimerFromTask"
              @cycle-status="handleCycleStatus"
              @prefill-subtask="prefillParentForSubtask"
              @delete-task="requestDeleteTask"
              @save-edit="handleSaveEdit"
              @link-ado="handleLinkAdo"
              @create-ado="openCreateAdoModal"
            />
          </div>
        </div>
      </div>
    </div>

    <AdoCreateWorkItemDialog
      v-model:open="createAdoDialogOpen"
      :task="createAdoTargetTask"
      :org-url="effectiveAdoTarget?.orgUrl"
      :project="effectiveAdoTarget?.project"
      :default-work-item-type="effectiveAdoTarget?.defaultWorkItemType"
      :unsynced-seconds="createAdoUnsyncedSeconds"
      :unsynced-log-ids="createAdoDirectLogs.map((l) => l.id)"
    />

    <AdoSyncReviewDialog v-model:open="syncReviewOpen" />

    <UiConfirmDialog
      :open="Boolean(pendingDeleteTask)"
      :title="$t('confirm.deleteTaskTitle')"
      :description="confirmDeleteDesc"
      :detail="pendingDeleteTask?.name"
      :loading="isDeleting"
      test-id="tasks-delete-confirm-dialog"
      @update:open="(open) => { if (!open && !isDeleting) pendingDeleteTask = null; }"
      @confirm="confirmDeleteTask"
      @cancel="() => { if (!isDeleting) pendingDeleteTask = null; }"
    />
  </div>
</template>
