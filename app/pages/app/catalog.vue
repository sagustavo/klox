<script setup lang="ts">
import { Plus, Trash2, Tag, CheckSquare } from 'lucide-vue-next';
import { PROJECT_COLOR_PALETTE, UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import type { EntityId, Project, TaskStatus } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();

const selectedProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);

// New Project form state
const newProjectName = ref('');
const newProjectColor = ref<string>(PROJECT_COLOR_PALETTE[0] ?? '#3B82F6');
const newProjectBillable = ref(true);

// Selected Project edit state
const editName = ref('');
const editColor = ref('#3B82F6');
const editBillable = ref(false);

// New Tag & Task form state
const newTagName = ref('');
const newTaskName = ref('');
const newTaskTargetHours = ref('');
const newTaskAdoId = ref('');

onMounted(async () => {
  if (authStore.user) {
    await catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode);
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

const scopedTasks = computed(() =>
  catalogStore.getTasksForProject(selectedProjectId.value)
);

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function selectProject(project: Project) {
  selectedProjectId.value = project.id;
  editName.value = project.name;
  editColor.value = project.color;
  editBillable.value = project.isBillableDefault;
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

async function handleDeleteSelectedProject() {
  if (!authStore.user || !selectedProject.value) return;
  if (selectedProject.value.systemKey === 'unassigned') return;
  await catalogStore.deleteProject({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
  });
  const fallback = catalogStore.sortedProjects[0];
  if (fallback) selectProject(fallback);
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

async function handleDeleteTag(tagId: EntityId) {
  if (!authStore.user) return;
  await catalogStore.deleteTag({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    tagId,
  });
}

async function handleCreateTask() {
  if (!authStore.user || !selectedProject.value || !newTaskName.value.trim()) return;
  const hours = Number(newTaskTargetHours.value);
  await catalogStore.createTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    name: newTaskName.value,
    targetHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
    externalWorkItemId: newTaskAdoId.value,
  });
  newTaskName.value = '';
  newTaskTargetHours.value = '';
  newTaskAdoId.value = '';
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

async function handleDeleteTask(taskId: EntityId) {
  if (!authStore.user) return;
  await catalogStore.deleteTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId,
  });
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

              <label class="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
                <input
                  v-model="newProjectBillable"
                  type="checkbox"
                  class="accent-accent"
                />
                <span>{{ $t('catalog.billableDefault') }}</span>
              </label>
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
              class="inline-flex h-7 items-center gap-1 border border-red-500/40 bg-red-500/10 px-2.5 text-[11px] font-mono uppercase text-red-400 hover:bg-red-500/20"
              @click="handleDeleteSelectedProject"
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
            <label class="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
              <input v-model="editBillable" type="checkbox" class="accent-accent" />
              <span>{{ $t('catalog.billableDefault') }}</span>
            </label>
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

          <div v-else class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="tag in scopedTags"
              :key="tag.id"
              class="inline-flex items-center gap-2 border border-border-hairline bg-bg-primary px-2.5 py-1 text-xs font-mono text-text-primary"
            >
              <span class="text-accent">#</span>
              <span>{{ tag.name }}</span>
              <button
                type="button"
                class="text-text-muted hover:text-red-400 transition-colors"
                @click="handleDeleteTag(tag.id)"
              >
                ×
              </button>
            </span>
          </div>
        </div>

        <!-- Project-Scoped Tasks & Goals -->
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="flex items-center gap-2 border-b border-border-hairline pb-3 text-xs font-mono uppercase tracking-wider text-accent">
            <CheckSquare class="h-3.5 w-3.5" />
            <span>{{ $t('catalog.tasksTitle') }} ({{ scopedTasks.length }})</span>
          </div>
          <p class="mt-2 text-xs text-text-muted">
            {{ $t('catalog.tasksHint') }}
          </p>

          <form class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12" @submit.prevent="handleCreateTask">
            <input
              v-model="newTaskName"
              type="text"
              required
              :placeholder="$t('catalog.newTaskPlaceholder')"
              class="sm:col-span-6 h-9 border border-border-hairline bg-bg-primary px-3 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            />
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
            <button
              type="submit"
              class="sm:col-span-2 inline-flex h-9 items-center justify-center gap-1 bg-accent px-2.5 text-xs font-mono uppercase text-white hover:bg-accent-hover transition-colors"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>{{ $t('catalog.addTask') }}</span>
            </button>
          </form>

          <div v-if="scopedTasks.length === 0" class="mt-4 text-xs font-mono text-text-muted">
            {{ $t('catalog.noTasksYet') }}
          </div>

          <ul v-else class="mt-4 divide-y divide-border-hairline border border-border-hairline bg-bg-primary">
            <li
              v-for="task in scopedTasks"
              :key="task.id"
              class="flex items-center justify-between gap-3 px-3 py-2 text-xs"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  class="tabular-telemetry border px-1.5 py-0.5 text-[10px] font-mono uppercase"
                  :class="{
                    'border-border-hairline text-text-muted': task.status === 'todo',
                    'border-accent/40 bg-accent/10 text-accent': task.status === 'in_progress',
                    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400': task.status === 'done',
                  }"
                  @click="handleCycleTaskStatus(task.id, task.status)"
                >
                  {{
                    task.status === 'todo'
                      ? $t('catalog.statusTodo')
                      : task.status === 'in_progress'
                        ? $t('catalog.statusInProgress')
                        : $t('catalog.statusDone')
                  }}
                </button>
                <span class="truncate font-medium text-text-primary">{{ task.name }}</span>
              </div>

              <div class="flex items-center gap-2 shrink-0 font-mono text-[11px] text-text-muted">
                <span v-if="task.targetHours" class="tabular-telemetry">
                  {{ task.targetHours }}h
                </span>
                <span
                  v-if="task.externalWorkItemId"
                  class="tabular-telemetry border border-border-hairline px-1.5 py-0.5 text-[10px]"
                >
                  ADO #{{ task.externalWorkItemId }}
                </span>
                <button
                  type="button"
                  class="text-text-muted hover:text-red-400"
                  @click="handleDeleteTask(task.id)"
                >
                  ×
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
