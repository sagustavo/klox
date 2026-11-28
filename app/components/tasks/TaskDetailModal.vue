<script setup lang="ts">
import {
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranch,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import type { AdoSelectedWorkItem } from '~/components/ado/AdoWorkItemPickerPopover.vue';
import {
  evaluateTaskTimerEligibility,
  resolveTaskSupportsCompletedWork,
  type TaskTimerEligibility,
} from '~/domain/ado';
import { formatHMS, nextCalendarDateKey, toDateKey } from '~/domain/duration';
import {
  MAX_TASK_DEPTH,
  classifyDueDateTone,
  compareTasksByPriority,
} from '~/domain/invariants';
import { renderBasicMarkdown } from '~/domain/markdown';
import type { EntityId, Project, Task, TaskStatus } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    open: boolean;
    taskId: EntityId | null;
    runningTaskId?: EntityId | null;
    runningElapsedSeconds?: number;
    trackedSecondsByTask?: ReadonlyMap<EntityId, number>;
    unsyncedHoursByTask?: ReadonlyMap<EntityId, number>;
    effectiveCompletedHoursByTask?: ReadonlyMap<EntityId, number>;
    timerEligibilityByTask?: ReadonlyMap<EntityId, TaskTimerEligibility>;
    adoConnected?: boolean;
    adoConnectionId?: string;
    adoOrgUrl?: string;
    adoProject?: string;
    adoEnabledForProject?: boolean;
  }>(),
  {
    runningTaskId: null,
    runningElapsedSeconds: 0,
    trackedSecondsByTask: () => new Map(),
    unsyncedHoursByTask: () => new Map(),
    effectiveCompletedHoursByTask: () => new Map(),
    timerEligibilityByTask: () => new Map(),
    adoConnected: false,
    adoConnectionId: undefined,
    adoOrgUrl: undefined,
    adoProject: undefined,
    adoEnabledForProject: false,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  startTimer: [taskId: EntityId];
  stopTimer: [];
  deleteTask: [task: Task];
  createAdo: [task: Task];
  selectTaskCard: [taskId: EntityId];
}>();

const { t } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const adoStore = useAdoStore();
const { formatDateKey } = useFormat(() => prefsStore.preferences);

const task = computed(() =>
  props.taskId ? catalogStore.getTaskById(props.taskId) ?? null : null
);

const project = computed<Project | undefined>(() =>
  task.value ? catalogStore.getProjectById(task.value.projectId) : undefined
);

const projectDisplayName = computed(() => {
  if (!project.value) return '';
  return project.value.systemKey === 'unassigned'
    ? t('catalog.unassigned')
    : project.value.name;
});

const projectTags = computed(() =>
  task.value ? catalogStore.getTagsForProject(task.value.projectId) : []
);

const parentAncestors = computed<Task[]>(() => {
  if (!task.value) return [];
  const chain: Task[] = [];
  const seen = new Set<EntityId>([task.value.id]);
  let cur: Task | undefined = task.value;
  while (cur?.parentTaskId && !seen.has(cur.parentTaskId)) {
    seen.add(cur.parentTaskId);
    const parent = catalogStore.getTaskById(cur.parentTaskId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
});

const immediateParent = computed<Task | null>(() => {
  if (!task.value?.parentTaskId) return null;
  return catalogStore.getTaskById(task.value.parentTaskId) ?? null;
});

const isLevel2RolledUp = computed(() => {
  if (!task.value) return false;
  return (
    (task.value.depth ?? 0) >= MAX_TASK_DEPTH &&
    !task.value.externalWorkItemId &&
    Boolean(immediateParent.value?.externalWorkItemId)
  );
});

const effectiveAdoUrl = computed(() => {
  if (!task.value) return null;
  return (
    task.value.externalWorkItemUrl ||
    (isLevel2RolledUp.value ? immediateParent.value?.externalWorkItemUrl ?? null : null)
  );
});

const depthBadgeLabel = computed(() => {
  const depth = task.value?.depth ?? 0;
  if (depth === 1) return t('tasks.detailModal.levelSubtask');
  if (depth >= 2) return t('tasks.detailModal.levelSubSubtask');
  return t('tasks.detailModal.levelTask');
});

const childTasks = computed(() => {
  if (!task.value) return [];
  return catalogStore.tasks
    .filter((item) => item.parentTaskId === task.value!.id)
    .sort(compareTasksByPriority);
});

const trackedSeconds = computed(() =>
  task.value ? props.trackedSecondsByTask.get(task.value.id) ?? 0 : 0
);

const unsyncedHours = computed(() =>
  task.value ? props.unsyncedHoursByTask.get(task.value.id) ?? 0 : 0
);

const effectiveCompletedHours = computed(() =>
  task.value
    ? props.effectiveCompletedHoursByTask.get(task.value.id) ?? task.value.completedWorkHours ?? 0
    : 0
);

const connWorkItemTypes = computed(() =>
  (props.adoConnectionId ? adoStore.workItemTypesByConn[props.adoConnectionId] : undefined) ??
  adoStore.workItemTypes
);

const connFieldRef = computed(() =>
  props.adoConnectionId
    ? adoStore.getConnectionById(props.adoConnectionId)?.completedWorkFieldRef
    : adoStore.connection?.completedWorkFieldRef
);

const taskEligibility = computed<TaskTimerEligibility>(() => {
  if (!task.value) return { allowed: true, reason: null };
  const provided = props.timerEligibilityByTask.get(task.value.id);
  if (provided) return provided;
  return evaluateTaskTimerEligibility({
    task: task.value,
    allTasks: catalogStore.tasks,
    policy: prefsStore.preferences.taskTrackingPolicy,
    workItemTypes: connWorkItemTypes.value,
    completedWorkFieldRef: connFieldRef.value,
  });
});

const taskSupportsCompletedWork = computed(() =>
  task.value
    ? resolveTaskSupportsCompletedWork(task.value, connWorkItemTypes.value, connFieldRef.value)
    : true
);

const startTimerDisabledReason = computed(() => {
  if (taskEligibility.value.allowed) return '';
  return taskEligibility.value.reason === 'PARENT_HAS_SUBTASKS'
    ? t('tasks.timerBlockedParentHint')
    : t('tasks.timerBlockedUnsupportedAdoHint');
});

const todayDateKey = computed(() =>
  toDateKey(new Date(), prefsStore.preferences.timeZone || 'UTC')
);
const tomorrowDateKey = computed(
  () => nextCalendarDateKey(todayDateKey.value) ?? todayDateKey.value
);

const dueTone = computed(() => {
  if (!task.value?.dueDate) return null;
  return classifyDueDateTone(task.value.dueDate, todayDateKey.value, task.value.status);
});

// Editable card drafts synced whenever target task changes
const titleDraft = ref('');
const descDraft = ref('');
const editingDescription = ref(false);
const descTextareaRef = ref<HTMLTextAreaElement | null>(null);
const targetHoursDraft = ref('');
const showingDatePicker = ref(false);
const newSubtaskName = ref('');
const newSubtaskInputRef = ref<HTMLInputElement | null>(null);

function syncDraftsFromTask(next: Task | null) {
  titleDraft.value = next?.name ?? '';
  descDraft.value = next?.description ?? '';
  targetHoursDraft.value = next?.targetHours ? String(next.targetHours) : '';
  editingDescription.value = !next?.description;
  showingDatePicker.value = Boolean(next?.dueDate);
  newSubtaskName.value = '';
  nextTick(() => {
    resizeTextareaFallback();
  });
}

watch(
  () => [props.open, task.value?.id] as const,
  ([isOpen]) => {
    if (isOpen) {
      syncDraftsFromTask(task.value);
    }
  },
  { immediate: true }
);

function resizeTextareaFallback() {
  const el = descTextareaRef.value;
  if (!el) return;
  if (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(88, Math.min(el.scrollHeight, 320))}px`;
}

function startDescriptionEdit() {
  editingDescription.value = true;
  descDraft.value = task.value?.description ?? '';
  nextTick(() => {
    descTextareaRef.value?.focus();
    resizeTextareaFallback();
  });
}

async function commitTitle() {
  if (!authStore.user || !task.value) return;
  const trimmed = titleDraft.value.trim();
  if (!trimmed) {
    titleDraft.value = task.value.name;
    return;
  }
  if (trimmed === task.value.name) return;

  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: trimmed,
  });
}

async function commitDescription(closePreview = true) {
  if (!authStore.user || !task.value) return;
  const trimmed = descDraft.value.trim();
  const prev = (task.value.description ?? '').trim();
  if (closePreview && trimmed) {
    editingDescription.value = false;
  }
  if (trimmed === prev) return;

  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: task.value.name,
    description: descDraft.value,
  });
}

async function handleStatusChange(nextStatus: TaskStatus) {
  if (!authStore.user || !task.value || task.value.status === nextStatus) return;
  await catalogStore.updateTaskStatus({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    status: nextStatus,
  });
}

async function handleTagsChange(nextTagIds: EntityId[]) {
  if (!authStore.user || !task.value) return;
  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: task.value.name,
    tagIds: nextTagIds,
  });
}

async function handleDueDateChange(nextDateKey: string | null) {
  if (!authStore.user || !task.value) return;
  if (!nextDateKey) {
    showingDatePicker.value = false;
  } else {
    showingDatePicker.value = true;
  }
  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: task.value.name,
    dueDate: nextDateKey,
  });
}

async function commitTargetHours() {
  if (!authStore.user || !task.value) return;
  const hrs = Number(targetHoursDraft.value);
  const next = Number.isFinite(hrs) && hrs > 0 ? hrs : null;
  if (next === (task.value.targetHours ?? null)) return;

  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: task.value.name,
    targetHours: next,
  });
}

async function handleLinkAdo(adoItem: AdoSelectedWorkItem | null) {
  if (!authStore.user || !task.value) return;
  if (!adoItem) {
    await catalogStore.updateTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: task.value.id,
      name: task.value.name,
      externalWorkItemId: null,
      completedWorkHours: 0,
    });
    return;
  }

  const shouldDefaultName =
    !task.value.name.trim() || /^#\d+$/.test(task.value.name.trim());

  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: task.value.id,
    name: shouldDefaultName ? adoItem.title.slice(0, 200) : task.value.name,
    externalWorkItemId: String(adoItem.id),
    externalWorkItemTitle: adoItem.title,
    externalWorkItemType: adoItem.workItemType,
    externalWorkItemUrl: adoItem.url,
    externalOrgUrl: adoItem.orgUrl,
    externalProject: adoItem.project,
    completedWorkHours: adoItem.completedWork,
    externalSyncedAt: new Date().toISOString(),
  });
  titleDraft.value = shouldDefaultName ? adoItem.title.slice(0, 200) : task.value.name;
}

async function handleToggleChildStatus(child: Task) {
  if (!authStore.user) return;
  await catalogStore.updateTaskStatus({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: child.id,
    status: child.status === 'done' ? 'todo' : 'done',
  });
}

async function commitNewSubtask() {
  if (!authStore.user || !task.value) return;
  const trimmed = newSubtaskName.value.trim();
  if (!trimmed) return;
  newSubtaskName.value = '';
  await catalogStore.createTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: task.value.projectId,
    parentTaskId: task.value.id,
    name: trimmed,
  });
  nextTick(() => {
    newSubtaskInputRef.value?.focus();
  });
}
</script>

<template>
  <DialogRoot :open="open && Boolean(task)" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        v-if="task"
        data-testid="task-detail-modal"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 flex min-h-[66svh] max-h-[90svh] w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-5xl xl:max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none"
      >
        <div class="signal-line shrink-0" aria-hidden="true" />

        <!-- Card Header (Breadcrumb + Quick Card Actions) -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-hairline px-5 py-4 sm:px-8">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <span
              v-if="project"
              class="h-2.5 w-2.5 shrink-0"
              :style="{ backgroundColor: project.color }"
              aria-hidden="true"
            />
            <span class="truncate text-xs font-medium text-text-muted">
              {{ projectDisplayName }}
            </span>

            <template v-for="anc in parentAncestors" :key="anc.id">
              <ChevronRight class="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden="true" />
              <button
                type="button"
                class="max-w-[140px] truncate text-xs text-text-muted hover:text-signal hover:underline"
                @click="emit('selectTaskCard', anc.id)"
              >
                {{ anc.name }}
              </button>
            </template>

            <ChevronRight class="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden="true" />

            <DialogTitle as="span" class="border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal">
              {{ depthBadgeLabel }}
            </DialogTitle>
            <DialogDescription class="sr-only">
              {{ task.name }}
            </DialogDescription>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              v-if="runningTaskId === task.id"
              type="button"
              data-testid="task-detail-stop-timer"
              :title="$t('timer.stopButton')"
              class="btn-press tabular-telemetry inline-flex h-8 items-center gap-1.5 border border-signal bg-signal-soft px-3 text-xs font-semibold text-signal hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
              @click="emit('stopTimer')"
            >
              <Square class="h-3 w-3 fill-current" aria-hidden="true" />
              <span>{{ formatHMS(runningElapsedSeconds) }}</span>
            </button>
            <button
              v-else
              type="button"
              data-testid="task-detail-start-timer"
              :disabled="!taskEligibility.allowed"
              :title="taskEligibility.allowed ? $t('catalog.startTaskTimer') : startTimerDisabledReason"
              :class="
                taskEligibility.allowed
                  ? 'btn-press inline-flex h-8 items-center gap-1.5 border border-signal/50 bg-signal-soft px-2.5 text-xs font-semibold text-signal hover:bg-accent hover:text-white transition-colors'
                  : 'inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 text-xs font-semibold text-text-faint opacity-50 cursor-not-allowed'
              "
              @click="taskEligibility.allowed && emit('startTimer', task.id)"
            >
              <Play class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>{{ $t('catalog.startTaskTimer') }}</span>
            </button>

            <a
              v-if="effectiveAdoUrl"
              :href="effectiveAdoUrl"
              target="_blank"
              rel="noopener noreferrer"
              :title="$t('tasks.rowMenu.openInAdo')"
              :aria-label="$t('tasks.rowMenu.openInAdo')"
              class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-signal hover:border-signal transition-colors"
            >
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </a>

            <button
              type="button"
              data-testid="task-detail-delete"
              :aria-label="$t('catalog.deleteTaskAria', { name: task.name })"
              :title="$t('confirm.deleteAction')"
              class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-destructive/50 hover:text-destructive transition-colors"
              @click="emit('deleteTask', task)"
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <DialogClose as-child>
              <button
                type="button"
                :aria-label="$t('confirm.cancelAction')"
                class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </div>

        <!-- Card Body (Spacious 2-column on lg+, single stack on mobile) -->
        <div class="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          <!-- Left Main Column: Title, Clean Auto-Grow Markdown Description & Subtasks -->
          <div class="lg:col-span-8 p-5 sm:p-8 space-y-6">
            <!-- Editable Task Title -->
            <div>
              <label for="task-detail-title" class="sr-only">
                {{ $t('tasks.detailModal.titleLabel') }}
              </label>
              <input
                id="task-detail-title"
                v-model="titleDraft"
                type="text"
                maxlength="200"
                data-testid="task-detail-title-input"
                :placeholder="$t('tasks.detailModal.titlePlaceholder')"
                class="-mx-2 w-[calc(100%+1rem)] border border-transparent bg-transparent px-2 py-1 text-base sm:text-lg font-semibold leading-snug text-text-primary hover:border-border-hairline focus:border-signal focus:bg-bg-primary focus:outline-none transition-colors"
                @blur="commitTitle"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              />
            </div>

            <!-- Description (Borderless Auto-Grow Markdown) -->
            <div class="space-y-2">
              <div class="label-eyebrow text-text-muted">
                {{ $t('tasks.detailModal.descriptionLabel') }}
              </div>

              <textarea
                v-if="editingDescription || !task.description"
                ref="descTextareaRef"
                v-model="descDraft"
                rows="3"
                data-testid="task-detail-desc-textarea"
                :placeholder="$t('tasks.detailModal.descriptionPlaceholder')"
                class="klox-autogrow-textarea w-full border border-border-hairline bg-bg-primary/60 p-3 text-ui leading-relaxed text-text-primary placeholder:text-text-faint focus:border-signal focus:bg-bg-primary focus:outline-none transition-colors"
                @input="resizeTextareaFallback"
                @blur="commitDescription(true)"
                @keydown.meta.enter.prevent="commitDescription(true)"
                @keydown.ctrl.enter.prevent="commitDescription(true)"
                @keydown.esc.stop.prevent="commitDescription(true)"
              />

              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-else
                role="button"
                tabindex="0"
                :title="$t('tasks.detailModal.clickToEditDescription')"
                class="cursor-text border border-transparent bg-bg-primary/40 p-3 text-ui leading-relaxed text-text-primary space-y-1.5 hover:border-border-hairline transition-colors"
                @click="startDescriptionEdit"
                @keydown.enter.prevent="startDescriptionEdit"
                v-html="renderBasicMarkdown(task.description)"
              />
            </div>

            <!-- Child Subtasks (shown when depth < 2) -->
            <div v-if="(task.depth ?? 0) < MAX_TASK_DEPTH" class="space-y-2.5 border-t border-border-hairline pt-5">
              <div class="flex items-center justify-between">
                <span class="label-eyebrow text-text-muted">
                  {{
                    (task.depth ?? 0) === 0
                      ? $t('tasks.detailModal.subtasksHeading', { count: childTasks.length })
                      : $t('tasks.detailModal.subSubtasksHeading', { count: childTasks.length })
                  }}
                </span>
              </div>

              <ul
                v-if="childTasks.length > 0"
                class="divide-y divide-border-subtle border border-border-hairline bg-bg-primary"
              >
                <li
                  v-for="child in childTasks"
                  :key="child.id"
                  class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-bg-hover/60 transition-colors"
                >
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      :aria-label="
                        child.status === 'done'
                          ? $t('tasks.markTodoAria', { name: child.name })
                          : $t('tasks.markDoneAria', { name: child.name })
                      "
                      class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                      :class="{
                        'border-text-muted/60 hover:border-signal': child.status === 'todo',
                        'border-signal bg-signal-soft text-signal': child.status === 'in_progress',
                        'border-emerald-500 bg-emerald-500 text-white': child.status === 'done',
                      }"
                      @click="handleToggleChildStatus(child)"
                    >
                      <Check v-if="child.status === 'done'" class="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      class="min-w-0 flex-1 truncate text-left text-ui transition-colors hover:text-signal"
                      :class="child.status === 'done' ? 'line-through text-text-muted' : 'text-text-primary'"
                      @click="emit('selectTaskCard', child.id)"
                    >
                      {{ child.name }}
                    </button>
                  </div>

                  <AdoWorkItemTypeBadge
                    v-if="child.externalWorkItemId"
                    :work-item-type="child.externalWorkItemType"
                    :work-item-id="child.externalWorkItemId"
                    compact
                  />
                </li>
              </ul>

              <div class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-1.5 focus-within:border-signal">
                <Plus class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
                <input
                  ref="newSubtaskInputRef"
                  v-model="newSubtaskName"
                  type="text"
                  maxlength="200"
                  enterkeyhint="done"
                  :placeholder="
                    (task.depth ?? 0) === 0
                      ? $t('tasks.inlineSubtaskPlaceholder')
                      : $t('tasks.inlineSubSubtaskPlaceholder')
                  "
                  class="h-7 w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
                  @keydown.enter.prevent="commitNewSubtask"
                />
              </div>
            </div>
          </div>

          <!-- Right Metadata Rail: Status, Scoped Tags, Deadline, ADO Link, Hours -->
          <div class="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-border-hairline bg-bg-primary/40 p-5 sm:p-7 space-y-5">
            <!-- Status -->
            <div class="space-y-1.5">
              <div class="label-eyebrow text-text-muted">
                {{ $t('tasks.detailModal.statusLabel') }}
              </div>
              <div class="grid grid-cols-3 border border-border-input bg-bg-primary">
                <button
                  v-for="st in (['todo', 'in_progress', 'done'] as const)"
                  :key="st"
                  type="button"
                  class="px-2 py-2 text-xs font-medium transition-colors"
                  :class="
                    task.status === st
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  "
                  @click="handleStatusChange(st)"
                >
                  {{ $t(`tasks.detailModal.status_${st}`) }}
                </button>
              </div>
            </div>

            <!-- Project-Scoped Tags (Toggl-style inline create) -->
            <div class="space-y-1.5">
              <div class="label-eyebrow text-text-muted">
                {{ $t('tasks.detailModal.tagsLabel') }}
              </div>
              <UiTagMultiSelect
                :model-value="task.tagIds ?? []"
                :tags="projectTags"
                :project-id="task.projectId"
                allow-create
                variant="field"
                size="sm"
                test-id="task-detail-tags-select"
                @update:model-value="handleTagsChange"
              />
            </div>

            <!-- Deadline -->
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="label-eyebrow flex items-center gap-1.5 text-text-muted">
                  <Calendar class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  <span>{{ $t('tasks.deadline.label') }}</span>
                </div>
                <span
                  v-if="dueTone === 'overdue'"
                  class="border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-xs font-medium text-rose-500"
                >
                  {{ $t('tasks.deadline.overdue') }}
                </span>
                <span
                  v-else-if="dueTone === 'today'"
                  class="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-500"
                >
                  {{ $t('tasks.deadline.today') }}
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="border border-border-hairline bg-bg-primary px-2 py-1 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
                  @click="handleDueDateChange(todayDateKey)"
                >
                  {{ $t('tasks.deadline.today') }}
                </button>
                <button
                  type="button"
                  class="border border-border-hairline bg-bg-primary px-2 py-1 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
                  @click="handleDueDateChange(tomorrowDateKey)"
                >
                  {{ $t('tasks.deadline.tomorrow') }}
                </button>
                <button
                  v-if="task.dueDate"
                  type="button"
                  data-testid="task-detail-clear-deadline"
                  class="ml-auto text-xs text-text-muted hover:text-destructive hover:underline"
                  @click="handleDueDateChange(null)"
                >
                  {{ $t('tasks.deadline.clear') }}
                </button>
              </div>

              <UiDateInput
                v-if="task.dueDate || showingDatePicker"
                :model-value="task.dueDate || todayDateKey"
                calendar-placement="inline"
                size="sm"
                test-id="task-detail-due-date"
                :aria-label="$t('tasks.deadline.label')"
                @update:model-value="handleDueDateChange"
              />
              <button
                v-else
                type="button"
                data-testid="task-detail-set-deadline"
                class="inline-flex h-9 w-full items-center justify-center gap-2 border border-dashed border-border-input bg-bg-primary/60 px-3 text-xs text-text-muted hover:border-signal hover:text-signal transition-colors"
                @click="handleDueDateChange(todayDateKey)"
              >
                <Calendar class="h-3.5 w-3.5" aria-hidden="true" />
                <span>{{ $t('tasks.deadline.pickDate') }}</span>
              </button>
            </div>

            <!-- Azure DevOps Work Item Link -->
            <div class="space-y-2 border-t border-border-hairline pt-4">
              <div class="label-eyebrow flex items-center gap-1.5 text-text-muted">
                <GitBranch class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                <span>{{ $t('tasks.detailModal.adoLabel') }}</span>
              </div>

              <div
                v-if="isLevel2RolledUp && immediateParent"
                class="border border-signal/35 bg-signal-soft/50 p-3 space-y-1.5 text-xs"
              >
                <AdoWorkItemTypeBadge
                  :work-item-type="immediateParent.externalWorkItemType"
                  :work-item-id="immediateParent.externalWorkItemId"
                  :url="immediateParent.externalWorkItemUrl"
                />
                <p class="text-text-muted">
                  {{
                    $t('tasks.rollsUpToAdoHint', {
                      id: immediateParent.externalWorkItemId,
                      type: immediateParent.externalWorkItemType || 'Task',
                    })
                  }}
                </p>
              </div>

              <template v-else-if="adoConnected">
                <div v-if="task.externalWorkItemId" class="flex flex-wrap items-center gap-1.5">
                  <AdoWorkItemTypeBadge
                    :work-item-type="task.externalWorkItemType"
                    :work-item-id="task.externalWorkItemId"
                    :work-item-title="task.externalWorkItemTitle"
                    :url="task.externalWorkItemUrl"
                    :completed-work-hours="effectiveCompletedHours"
                    show-hours
                  />
                  <span
                    v-if="childTasks.length > 0 && effectiveCompletedHours > 0"
                    class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted"
                    :title="$t('tasks.completedWorkRolledUpHint')"
                  >
                    ∑ {{ effectiveCompletedHours.toFixed(2) }}h
                  </span>
                  <span
                    v-if="unsyncedHours > 0"
                    class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-500"
                  >
                    +{{ unsyncedHours.toFixed(2) }}h
                  </span>
                </div>
                <p
                  v-if="task.externalWorkItemId && !taskSupportsCompletedWork"
                  class="text-xs text-amber-500"
                >
                  {{ $t('tasks.adoPushDisabledForTypeHint') }}
                </p>

                <AdoWorkItemPickerPopover
                  variant="field"
                  :connection-id="adoConnectionId"
                  :work-item-id="task.externalWorkItemId"
                  :work-item-title="task.externalWorkItemTitle"
                  :org-url="adoOrgUrl"
                  :project="adoProject"
                  @select="handleLinkAdo"
                />

                <button
                  v-if="adoEnabledForProject && !task.externalWorkItemId"
                  type="button"
                  class="btn-press inline-flex h-9 w-full items-center justify-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
                  @click="emit('createAdo', task)"
                >
                  <Plus class="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{{ $t('tasks.createInAdo') }}</span>
                </button>
              </template>

              <NuxtLink
                v-else
                :to="localePath('/app/settings#azure-devops')"
                class="inline-flex h-9 w-full items-center justify-center gap-2 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
              >
                <GitBranch class="h-3.5 w-3.5" aria-hidden="true" />
                <span>{{ $t('tasks.connectAdoCta') }}</span>
              </NuxtLink>
            </div>

            <!-- Time Tracked & Target Estimate -->
            <div class="grid grid-cols-2 gap-3 border-t border-border-hairline pt-4">
              <div class="space-y-1">
                <div class="label-eyebrow flex items-center gap-1 text-text-muted">
                  <Clock class="h-3 w-3" aria-hidden="true" />
                  <span>{{ $t('tasks.detailModal.trackedLabel') }}</span>
                </div>
                <div class="tabular-telemetry border border-border-hairline bg-bg-primary px-2.5 py-2 text-sm font-semibold text-text-primary">
                  {{ formatHMS(trackedSeconds) }}
                </div>
              </div>

              <div class="space-y-1">
                <label
                  :for="`task-detail-target-hrs-${task.id}`"
                  class="label-eyebrow block text-text-muted"
                >
                  {{ $t('catalog.targetHoursPlaceholder') }}
                </label>
                <input
                  :id="`task-detail-target-hrs-${task.id}`"
                  v-model="targetHoursDraft"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0.0"
                  class="tabular-telemetry h-[38px] w-full border border-border-input bg-bg-primary px-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
                  @blur="commitTargetHours"
                  @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                />
              </div>
            </div>

            <div v-if="task.dueDate" class="text-xs text-text-muted tabular-telemetry">
              {{ $t('tasks.deadline.formattedDate', { date: formatDateKey(task.dueDate) }) }}
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.klox-autogrow-textarea {
  field-sizing: content;
  width: 100%;
  height: auto;
  min-block-size: 4lh;
  max-block-size: 14lh;
  resize: none;
}
</style>
