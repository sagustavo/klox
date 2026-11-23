<script setup lang="ts">
import { Check, CheckSquare, CornerDownRight, Pencil, Play, Plus, Tag, Trash2, X } from 'lucide-vue-next';
import {
  MAX_TASK_DEPTH,
  PROJECT_COLOR_PALETTE,
  UNASSIGNED_PROJECT_ID,
  collectDescendantTaskIds,
} from '~/domain/invariants';
import { renderBasicMarkdown } from '~/domain/markdown';
import type { EntityId, Project, ProjectTag, Task, TaskStatus } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimerStore } from '~/stores/timer';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timerStore = useTimerStore();

const selectedProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);

// New Project form state
const newProjectName = ref('');
const newProjectColor = ref<string>(PROJECT_COLOR_PALETTE[0] ?? '#3B82F6');
const newProjectBillable = ref(true);

// Selected Project edit state
const editName = ref('');
const editColor = ref('#3B82F6');
const editBillable = ref(false);

// New Tag, Inline Tag Rename & Hierarchical Task form state
const newTagName = ref('');
const editingTagId = ref<EntityId | null>(null);
const editingTagName = ref('');
const tagRenameError = ref<string | null>(null);
const tagRenameInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const newTaskName = ref('');
const newTaskDescription = ref('');
const newTaskParentId = ref<EntityId>('');
const newTaskTargetHours = ref('');
const newTaskAdoId = ref('');
const taskNameInputRef = ref<HTMLInputElement | null>(null);

// Standardized Delete Confirmation state (FR-5.3)
type PendingCatalogDelete =
  | { kind: 'project'; project: Project; tagCount: number; taskCount: number }
  | { kind: 'tag'; tag: ProjectTag }
  | { kind: 'task'; taskId: EntityId; name: string; descendantCount: number };

const pendingDelete = ref<PendingCatalogDelete | null>(null);
const isDeleting = ref(false);

onMounted(async () => {
  if (authStore.user) {
    await Promise.all([
      catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
      timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    ]);
    const first = catalogStore.sortedProjects[0];
    if (first) {
      selectProject(first);
    }
  }
});

const selectedProject = computed(() =>
  catalogStore.getProjectById(selectedProjectId.value)
);

const scopedTags = computed(() =>
  catalogStore.getTagsForProject(selectedProjectId.value)
);

const flattenedTasks = computed(() =>
  catalogStore.getFlattenedTasksForProject(selectedProjectId.value)
);

const eligibleParentTasks = computed(() =>
  flattenedTasks.value.filter((node) => node.depth < MAX_TASK_DEPTH)
);

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function selectProject(project: Project) {
  selectedProjectId.value = project.id;
  editName.value = project.name;
  editColor.value = project.color;
  editBillable.value = project.isBillableDefault;
  newTaskParentId.value = '';
  cancelEditTag();
}

async function handleCreateProject() {
  if (!authStore.user || !newProjectName.value.trim()) return;
  const created = await catalogStore.createProject({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    name: newProjectName.value,
    color: newProjectColor.value,
    isBillableDefault: newProjectBillable.value,
  });
  newProjectName.value = '';
  const nextColor =
    PROJECT_COLOR_PALETTE[catalogStore.projects.length % PROJECT_COLOR_PALETTE.length];
  if (nextColor) newProjectColor.value = nextColor;
  selectProject(created);
}

async function handleUpdateSelectedProject() {
  if (!authStore.user || !selectedProject.value) return;
  await catalogStore.updateProject({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    name: editName.value,
    color: editColor.value,
    isBillableDefault: editBillable.value,
  });
}

function requestDeleteSelectedProject() {
  if (!authStore.user || !selectedProject.value) return;
  if (selectedProject.value.systemKey === 'unassigned') return;
  pendingDelete.value = {
    kind: 'project',
    project: selectedProject.value,
    tagCount: scopedTags.value.length,
    taskCount: flattenedTasks.value.length,
  };
}

async function handleCreateTag() {
  if (!authStore.user || !selectedProject.value || !newTagName.value.trim()) return;
  await catalogStore.createTag({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    name: newTagName.value,
  });
  newTagName.value = '';
}

function startEditTag(tag: ProjectTag) {
  editingTagId.value = tag.id;
  editingTagName.value = tag.name;
  tagRenameError.value = null;
  nextTick(() => {
    const rawRef = tagRenameInputRef.value;
    const inputEl = Array.isArray(rawRef) ? rawRef[0] : rawRef;
    inputEl?.focus();
    inputEl?.select();
  });
}

function cancelEditTag() {
  editingTagId.value = null;
  editingTagName.value = '';
  tagRenameError.value = null;
}

async function saveEditTag(tagId: EntityId) {
  if (!authStore.user) return;
  const result = await catalogStore.renameTag({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    tagId,
    name: editingTagName.value,
  });
  if (!result.ok) {
    tagRenameError.value = result.error ?? 'TAG_NAME_EMPTY';
    return;
  }
  cancelEditTag();
}

function requestDeleteTag(tag: ProjectTag) {
  pendingDelete.value = { kind: 'tag', tag };
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
    externalWorkItemId: newTaskAdoId.value,
  });
  newTaskName.value = '';
  newTaskDescription.value = '';
  newTaskParentId.value = '';
  newTaskTargetHours.value = '';
  newTaskAdoId.value = '';
}

function prefillParentForSubtask(parentId: EntityId) {
  newTaskParentId.value = parentId;
  nextTick(() => {
    taskNameInputRef.value?.focus();
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

async function handleCycleTaskStatus(taskId: EntityId, current: TaskStatus) {
  if (!authStore.user) return;
  const next: TaskStatus =
    current === 'todo' ? 'in_progress' : current === 'in_progress' ? 'done' : 'todo';
  await catalogStore.updateTaskStatus({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId,
    status: next,
  });
}

function requestDeleteTask(task: Task) {
  const ids = collectDescendantTaskIds(task.id, catalogStore.tasks);
  pendingDelete.value = {
    kind: 'task',
    taskId: task.id,
    name: task.name,
    descendantCount: Math.max(0, ids.length - 1),
  };
}

const confirmDialogTitle = computed(() => {
  const target = pendingDelete.value;
  if (!target) return '';
  if (target.kind === 'project') return t('confirm.deleteProjectTitle');
  if (target.kind === 'tag') return t('confirm.deleteTagTitle');
  return t('confirm.deleteTaskTitle');
});

const confirmDialogDescription = computed(() => {
  const target = pendingDelete.value;
  if (!target) return '';
  if (target.kind === 'project') {
    return t('confirm.deleteProjectDesc', {
      name: target.project.name,
      tagCount: target.tagCount,
      taskCount: target.taskCount,
    });
  }
  if (target.kind === 'tag') {
    return t('confirm.deleteTagDesc', { name: target.tag.name });
  }
  if (target.descendantCount > 0) {
    return t('confirm.deleteTaskCascadeDesc', {
      name: target.name,
      descendantCount: target.descendantCount,
    });
  }
  return t('confirm.deleteTaskDesc', { name: target.name });
});

const confirmDialogDetail = computed(() => {
  const target = pendingDelete.value;
  if (!target) return undefined;
  if (target.kind === 'project') return target.project.name;
  if (target.kind === 'tag') return `#${target.tag.name}`;
  return target.name;
});

async function confirmCatalogDelete() {
  if (!authStore.user || !pendingDelete.value || isDeleting.value) return;
  isDeleting.value = true;
  try {
    const target = pendingDelete.value;
    if (target.kind === 'project') {
      await catalogStore.deleteProject({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        projectId: target.project.id,
      });
      const fallback = catalogStore.sortedProjects[0];
      if (fallback) selectProject(fallback);
    } else if (target.kind === 'tag') {
      if (editingTagId.value === target.tag.id) cancelEditTag();
      await catalogStore.deleteTag({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        tagId: target.tag.id,
      });
    } else {
      await catalogStore.deleteTask({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        taskId: target.taskId,
      });
    }
    pendingDelete.value = null;
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="border border-border-hairline bg-bg-elevated p-5">
      <h1 class="text-lg font-semibold text-text-primary">
        {{ $t('catalog.title') }}
      </h1>
      <p class="mt-1 text-xs text-text-muted">
        {{ $t('catalog.subtitle') }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Left Column: Projects List + Create Project Form -->
      <div class="lg:col-span-5 space-y-4">
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="border-b border-border-hairline pb-3 text-xs font-mono uppercase tracking-wider text-accent">
            {{ $t('catalog.projectsTitle') }} ({{ catalogStore.sortedProjects.length }})
          </div>

          <!-- Create New Project Form -->
          <form class="mt-4 space-y-3 border-b border-border-hairline pb-4" @submit.prevent="handleCreateProject">
            <input
              v-model="newProjectName"
              type="text"
              required
              :placeholder="$t('catalog.newProjectPlaceholder')"
              class="h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            />

            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <input
                  v-model="newProjectColor"
                  type="color"
                  :aria-label="$t('catalog.colorLabel')"
                  class="h-7 w-7 cursor-pointer border border-border-hairline bg-bg-primary p-0.5"
                />
                <button
                  v-for="swatch in PROJECT_COLOR_PALETTE"
                  :key="swatch"
                  type="button"
                  class="h-5 w-5 border transition-transform"
                  :class="
                    newProjectColor.toUpperCase() === swatch
                      ? 'border-white scale-110'
                      : 'border-border-hairline opacity-75 hover:opacity-100'
                  "
                  :style="{ backgroundColor: swatch }"
                  @click="newProjectColor = swatch"
                />
              </div>

              <UiBillableToggle
                v-model="newProjectBillable"
                variant="pill"
                :label="$t('catalog.billableDefault')"
              />
            </div>

            <button
              type="submit"
              class="inline-flex h-8 w-full items-center justify-center gap-1.5 bg-accent px-3 text-xs font-mono uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>{{ $t('catalog.addProject') }}</span>
            </button>
          </form>

          <!-- Project List -->
          <ul class="mt-3 divide-y divide-border-hairline">
            <li
              v-for="proj in catalogStore.sortedProjects"
              :key="proj.id"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors"
                :class="
                  selectedProjectId === proj.id
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-primary'
                "
                @click="selectProject(proj)"
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
                    v-if="proj.systemKey === 'unassigned'"
                    class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[10px] font-mono text-text-muted"
                  >
                    {{ $t('catalog.systemBadge') }}
                  </span>
                  <span
                    v-if="proj.isBillableDefault"
                    class="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                  >
                    $
                  </span>
                  <span class="tabular-telemetry text-[11px] font-mono text-text-muted">
                    {{ catalogStore.getTagsForProject(proj.id).length }} #
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Right Column: Selected Project Settings + Project-Scoped Tags + Tasks -->
      <div v-if="selectedProject" class="lg:col-span-7 space-y-6">
        <!-- Project Inspector Header -->
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
            <div class="flex items-center gap-2.5">
              <span
                class="h-3.5 w-3.5"
                :style="{ backgroundColor: selectedProject.color }"
              />
              <h2 class="text-base font-semibold text-text-primary">
                {{ displayProjectName(selectedProject) }}
              </h2>
              <span
                class="border px-1.5 py-0.5 text-[10px] font-mono"
                :class="
                  selectedProject.isBillableDefault
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-hairline bg-bg-primary text-text-muted'
                "
              >
                {{
                  selectedProject.isBillableDefault
                    ? $t('catalog.billableBadge')
                    : $t('catalog.nonBillableBadge')
                }}
              </span>
            </div>

            <button
              v-if="selectedProject.systemKey !== 'unassigned'"
              type="button"
              data-testid="catalog-project-delete"
              class="inline-flex h-7 items-center gap-1 border border-red-500/40 bg-red-500/10 px-2.5 text-[11px] font-mono uppercase text-red-400 hover:bg-red-500/20"
              @click="requestDeleteSelectedProject"
            >
              <Trash2 class="h-3 w-3" />
              <span>{{ $t('catalog.deleteProject') }}</span>
            </button>
          </div>

          <form
            class="mt-4 flex flex-wrap items-center gap-3"
            @submit.prevent="handleUpdateSelectedProject"
          >
            <input
              v-if="selectedProject.systemKey !== 'unassigned'"
              v-model="editName"
              type="text"
              required
              class="h-8 flex-1 min-w-[180px] border border-border-hairline bg-bg-primary px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
            <input
              v-model="editColor"
              type="color"
              class="h-8 w-8 cursor-pointer border border-border-hairline bg-bg-primary p-0.5"
            />
            <UiBillableToggle
              v-model="editBillable"
              variant="pill"
              :label="$t('catalog.billableDefault')"
            />
            <button
              type="submit"
              class="inline-flex h-8 items-center border border-border-hairline bg-bg-primary px-3 text-xs font-mono uppercase text-text-primary hover:bg-bg-hover"
            >
              {{ $t('catalog.saveChanges') }}
            </button>
          </form>
        </div>

        <!-- Project-Scoped Tags -->
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="flex items-center justify-between border-b border-border-hairline pb-3">
            <div class="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-accent">
              <Tag class="h-3.5 w-3.5" />
              <span>{{ $t('catalog.scopedTagsTitle') }} ({{ scopedTags.length }})</span>
            </div>
          </div>
          <p class="mt-2 text-xs text-text-muted">
            {{ $t('catalog.scopedTagsHint') }}
          </p>

          <form class="mt-3 flex gap-2" @submit.prevent="handleCreateTag">
            <input
              v-model="newTagName"
              type="text"
              required
              :placeholder="$t('catalog.newTagPlaceholder')"
              class="h-9 flex-1 border border-border-hairline bg-bg-primary px-3 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              class="inline-flex h-9 items-center gap-1.5 bg-accent px-3.5 text-xs font-mono uppercase text-white hover:bg-accent-hover transition-colors"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>{{ $t('catalog.addTag') }}</span>
            </button>
          </form>

          <div v-if="scopedTags.length === 0" class="mt-4 text-xs font-mono text-text-muted">
            {{ $t('catalog.noTagsYet') }}
          </div>

          <div v-else class="mt-4 space-y-2">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="tag in scopedTags"
                :key="tag.id"
                :data-testid="`catalog-tag-chip-${tag.id}`"
                class="inline-flex items-center gap-1.5 border bg-bg-primary px-2.5 py-1 text-xs font-mono text-text-primary transition-colors"
                :class="
                  editingTagId === tag.id
                    ? 'border-accent'
                    : 'border-border-hairline'
                "
              >
                <span class="text-accent">#</span>
                <form
                  v-if="editingTagId === tag.id"
                  class="inline-flex items-center gap-1"
                  @submit.prevent="saveEditTag(tag.id)"
                >
                  <input
                    ref="tagRenameInputRef"
                    v-model="editingTagName"
                    type="text"
                    maxlength="80"
                    data-testid="catalog-tag-rename-input"
                    :aria-label="$t('catalog.renameTagAria', { name: tag.name })"
                    class="h-6 w-32 border border-border-hairline bg-bg-elevated px-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
                    @keydown.esc.stop.prevent="cancelEditTag"
                  />
                  <button
                    type="submit"
                    data-testid="catalog-tag-rename-save"
                    class="inline-flex h-5 w-5 items-center justify-center text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                    :aria-label="$t('catalog.renameTagSave')"
                    :title="$t('catalog.renameTagSave')"
                  >
                    <Check class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-rename-cancel"
                    class="inline-flex h-5 w-5 items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                    :aria-label="$t('catalog.renameTagCancel')"
                    :title="$t('catalog.renameTagCancel')"
                    @click="cancelEditTag"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </form>

                <template v-else>
                  <button
                    type="button"
                    class="hover:text-accent transition-colors text-left"
                    :title="$t('catalog.renameTagAria', { name: tag.name })"
                    @click="startEditTag(tag)"
                  >
                    {{ tag.name }}
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-rename-trigger"
                    class="inline-flex h-5 w-5 items-center justify-center text-text-muted hover:text-accent transition-colors"
                    :aria-label="$t('catalog.renameTagAria', { name: tag.name })"
                    :title="$t('catalog.renameTagAria', { name: tag.name })"
                    @click="startEditTag(tag)"
                  >
                    <Pencil class="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-delete-trigger"
                    class="inline-flex h-5 w-5 items-center justify-center text-text-muted hover:text-red-400 transition-colors"
                    :aria-label="$t('catalog.deleteTagAria', { name: tag.name })"
                    :title="$t('catalog.deleteTagAria', { name: tag.name })"
                    @click="requestDeleteTag(tag)"
                  >
                    <Trash2 class="h-2.5 w-2.5" />
                  </button>
                </template>
              </span>
            </div>

            <p
              v-if="tagRenameError"
              data-testid="catalog-tag-rename-error"
              class="text-xs font-mono text-red-400"
            >
              {{ $t(`catalog.tagRenameErrors.${tagRenameError}`) }}
            </p>
          </div>
        </div>

        <!-- Project-Scoped Tasks, Subtasks & Sub-subtasks (FR-4) -->
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="flex items-center gap-2 border-b border-border-hairline pb-3 text-xs font-mono uppercase tracking-wider text-accent">
            <CheckSquare class="h-3.5 w-3.5" />
            <span>{{ $t('catalog.tasksTitle') }} ({{ flattenedTasks.length }})</span>
          </div>
          <p class="mt-2 text-xs text-text-muted">
            {{ $t('catalog.tasksHint') }}
          </p>

          <form class="mt-3 space-y-2.5" @submit.prevent="handleCreateTask">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                ref="taskNameInputRef"
                v-model="newTaskName"
                type="text"
                required
                :placeholder="$t('catalog.newTaskPlaceholder')"
                class="sm:col-span-5 h-9 border border-border-hairline bg-bg-primary px-3 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
              <select
                v-model="newTaskParentId"
                :aria-label="$t('catalog.parentTaskLabel')"
                class="sm:col-span-3 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
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
                class="tabular-telemetry sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
              <input
                v-model="newTaskAdoId"
                type="text"
                :placeholder="$t('catalog.adoWorkItemPlaceholder')"
                class="tabular-telemetry sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <textarea
                v-model="newTaskDescription"
                rows="2"
                :placeholder="$t('catalog.taskDescriptionPlaceholder')"
                class="flex-1 border border-border-hairline bg-bg-primary p-2.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                class="inline-flex h-9 sm:h-auto sm:w-36 shrink-0 items-center justify-center gap-1 bg-accent px-3 text-xs font-mono uppercase text-white hover:bg-accent-hover transition-colors"
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{{ $t('catalog.addTask') }}</span>
              </button>
            </div>
          </form>

          <div v-if="flattenedTasks.length === 0" class="mt-4 text-xs font-mono text-text-muted">
            {{ $t('catalog.noTasksYet') }}
          </div>

          <ul v-else class="mt-4 divide-y divide-border-hairline border border-border-hairline bg-bg-primary">
            <li
              v-for="node in flattenedTasks"
              :key="node.task.id"
              class="px-3 py-2.5 text-xs transition-colors hover:bg-bg-hover/40"
              :class="{
                'pl-7': node.depth === 1,
                'pl-12': node.depth === 2,
              }"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <CornerDownRight
                    v-if="node.depth > 0"
                    class="h-3.5 w-3.5 shrink-0 text-text-muted"
                  />
                  <button
                    type="button"
                    class="tabular-telemetry border px-1.5 py-0.5 text-[10px] font-mono uppercase shrink-0"
                    :class="{
                      'border-border-hairline text-text-muted': node.task.status === 'todo',
                      'border-accent/40 bg-accent/10 text-accent': node.task.status === 'in_progress',
                      'border-emerald-500/40 bg-emerald-500/10 text-emerald-400': node.task.status === 'done',
                    }"
                    @click="handleCycleTaskStatus(node.task.id, node.task.status)"
                  >
                    {{
                      node.task.status === 'todo'
                        ? $t('catalog.statusTodo')
                        : node.task.status === 'in_progress'
                          ? $t('catalog.statusInProgress')
                          : $t('catalog.statusDone')
                    }}
                  </button>
                  <span class="truncate font-medium text-text-primary">{{ node.task.name }}</span>
                </div>

                <div class="flex flex-wrap items-center gap-2 shrink-0 font-mono text-[11px] text-text-muted">
                  <span v-if="node.task.targetHours" class="tabular-telemetry">
                    {{ node.task.targetHours }}h
                  </span>
                  <span
                    v-if="node.task.externalWorkItemId"
                    class="tabular-telemetry border border-border-hairline px-1.5 py-0.5 text-[10px]"
                  >
                    ADO #{{ node.task.externalWorkItemId }}
                  </span>

                  <!-- + Subtask / + Sub-subtask button for depth 0 and depth 1 -->
                  <button
                    v-if="node.depth < MAX_TASK_DEPTH"
                    type="button"
                    class="border border-border-hairline bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted hover:border-accent hover:text-text-primary transition-colors"
                    @click="prefillParentForSubtask(node.task.id)"
                  >
                    {{ node.depth === 0 ? $t('catalog.addSubtask') : $t('catalog.addSubSubtask') }}
                  </button>

                  <!-- Direct [▶ Start] Timer Button (FR-4.3) -->
                  <span
                    v-if="timerStore.isRunning && timerStore.taskId === node.task.id"
                    class="inline-flex items-center gap-1 border border-accent bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent"
                  >
                    <span class="h-1.5 w-1.5 bg-accent animate-pulse" />
                    <span>{{ $t('catalog.runningTaskBadge') }}</span>
                  </span>
                  <button
                    v-else
                    type="button"
                    class="inline-flex items-center gap-1 border border-accent/50 bg-accent/10 px-2 py-0.5 text-[10px] uppercase text-accent hover:bg-accent hover:text-white transition-colors"
                    @click="handleStartTimerFromTask(node.task.id)"
                  >
                    <Play class="h-2.5 w-2.5 fill-current" />
                    <span>{{ $t('catalog.startTaskTimer') }}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="catalog-task-delete-trigger"
                    class="text-text-muted hover:text-red-400 px-1"
                    :aria-label="$t('catalog.deleteTaskAria', { name: node.task.name })"
                    :title="$t('catalog.deleteTaskAria', { name: node.task.name })"
                    @click="requestDeleteTask(node.task)"
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              </div>

              <!-- Rendered Basic Markdown Description (FR-4.2) -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-if="node.task.description"
                class="mt-1.5 border-l-2 border-border-hairline pl-2.5 text-xs text-text-muted space-y-1"
                v-html="renderBasicMarkdown(node.task.description)"
              />
            </li>
          </ul>
        </div>
      </div>
    </div>

    <UiConfirmDialog
      :open="Boolean(pendingDelete)"
      :title="confirmDialogTitle"
      :description="confirmDialogDescription"
      :detail="confirmDialogDetail"
      :loading="isDeleting"
      test-id="catalog-delete-confirm-dialog"
      @update:open="(open) => { if (!open && !isDeleting) pendingDelete = null; }"
      @confirm="confirmCatalogDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>
