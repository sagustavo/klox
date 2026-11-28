<script setup lang="ts">
import { Check, CheckSquare, ChevronDown, Plus, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { PROJECT_COLOR_PALETTE, type TaskTreeNode } from '~/domain/invariants';
import type { EntityId, Project } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

const props = withDefaults(
  defineProps<{
    projectId: EntityId;
    projectNameSnapshot?: string;
    projectColorSnapshot?: string;
    taskId?: EntityId;
    taskNameSnapshot?: string;
    variant?: 'row' | 'command' | 'field';
    allowCreateProject?: boolean;
    dataTour?: string;
    stopPropagation?: boolean;
    testId?: string;
  }>(),
  {
    projectNameSnapshot: undefined,
    projectColorSnapshot: undefined,
    taskId: undefined,
    taskNameSnapshot: undefined,
    variant: 'row',
    allowCreateProject: true,
    dataTour: undefined,
    stopPropagation: false,
    testId: undefined,
  }
);

const emit = defineEmits<{
  select: [payload: { projectId: EntityId; taskId: EntityId | null }];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();

const open = ref(false);
const searchQuery = ref('');
const creatingProject = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

const activeProject = computed(() => catalogStore.getProjectById(props.projectId));

const resolvedColor = computed(
  () => activeProject.value?.color || props.projectColorSnapshot || '#8E8E93'
);

const isUnassignedProject = computed(
  () => !activeProject.value || activeProject.value.systemKey === 'unassigned'
);

const resolvedProjectLabel = computed(() => {
  if (activeProject.value?.systemKey === 'unassigned') return t('catalog.unassigned');
  if (activeProject.value) return activeProject.value.name;
  return props.projectNameSnapshot || t('catalog.unassigned');
});

const resolvedTaskLabel = computed(() => {
  if (!props.taskId && !props.taskNameSnapshot) return null;
  const liveLabel = props.taskId ? catalogStore.getTaskHierarchicalLabel(props.taskId) : '';
  return liveLabel || props.taskNameSnapshot || null;
});

const commandAriaLabel = computed(() =>
  resolvedTaskLabel.value
    ? `${t('timer.projectLabel')}: ${resolvedProjectLabel.value} · ${resolvedTaskLabel.value}`
    : `${t('timer.projectLabel')}: ${resolvedProjectLabel.value}`
);

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const sorted = catalogStore.sortedProjects;
  if (!q) return sorted;

  return sorted.filter((proj) => {
    if (displayProjectName(proj).toLowerCase().includes(q)) return true;
    const tasks = catalogStore.getFlattenedTasksForProject(proj.id);
    return tasks.some((node) => node.hierarchicalLabel.toLowerCase().includes(q));
  });
});

const activeProjectTasks = computed<TaskTreeNode[]>(() => {
  const nodes = catalogStore.getFlattenedTasksForProject(props.projectId);
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return nodes;
  return nodes.filter((node) => node.hierarchicalLabel.toLowerCase().includes(q));
});

const creatableProjectName = computed(() => {
  if (!props.allowCreateProject || !authStore.user) return '';
  const trimmed = searchQuery.value.trim();
  if (!trimmed || trimmed.length > 120) return '';
  const lower = trimmed.toLowerCase();
  const exists = catalogStore.sortedProjects.some(
    (proj) =>
      proj.name.trim().toLowerCase() === lower ||
      displayProjectName(proj).trim().toLowerCase() === lower
  );
  return exists ? '' : trimmed;
});

const nextProjectColorPreview = computed(
  () => PROJECT_COLOR_PALETTE[catalogStore.projects.length % PROJECT_COLOR_PALETTE.length] ?? '#3B82F6'
);

async function handleCreateProjectInline() {
  const name = creatableProjectName.value;
  if (!name || !authStore.user || creatingProject.value) return;

  creatingProject.value = true;
  try {
    const created = await catalogStore.createProject({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      name,
      color: nextProjectColorPreview.value,
      isBillableDefault: true,
    });
    emit('select', { projectId: created.id, taskId: null });
    searchQuery.value = '';
    open.value = false;
  } finally {
    creatingProject.value = false;
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && creatableProjectName.value) {
    if (filteredProjects.value.length === 0 || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      void handleCreateProjectInline();
    }
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

function handleTriggerClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
}

function handleSelectProject(project: Project) {
  const projectHasTasks = catalogStore.getTasksForProject(project.id).length > 0;
  const nextTaskId = project.id === props.projectId ? (props.taskId ?? null) : null;
  emit('select', { projectId: project.id, taskId: nextTaskId });
  if (!projectHasTasks) {
    open.value = false;
  }
}

function handleSelectTask(nextTaskId: EntityId | null) {
  emit('select', { projectId: props.projectId, taskId: nextTaskId });
  open.value = false;
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        v-if="variant === 'command'"
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'command-project-trigger'"
        :aria-label="commandAriaLabel"
        :title="commandAriaLabel"
        class="btn-press inline-flex h-9 max-w-[190px] sm:max-w-[240px] items-center gap-2 border border-transparent bg-transparent px-2.5 text-left text-ui transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-signal data-[state=open]:bg-bg-hover"
        @click="handleTriggerClick"
      >
        <span
          class="h-2.5 w-2.5 shrink-0"
          :style="{ backgroundColor: resolvedColor }"
          aria-hidden="true"
        />
        <span
          class="truncate font-medium"
          :class="isUnassignedProject ? 'text-text-muted' : 'text-text-primary'"
        >
          {{ resolvedProjectLabel }}
        </span>
        <span
          v-if="resolvedTaskLabel"
          class="hidden sm:inline truncate text-xs font-normal text-text-muted"
        >
          · {{ resolvedTaskLabel }}
        </span>
      </button>

      <button
        v-else-if="variant === 'field'"
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'field-project-trigger'"
        :aria-label="commandAriaLabel"
        :title="commandAriaLabel"
        class="inline-flex h-10 w-full items-center justify-between gap-2 border border-border-input bg-bg-primary px-3 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
        @click="handleTriggerClick"
      >
        <span class="inline-flex items-center gap-2 min-w-0 truncate">
          <span
            class="h-2.5 w-2.5 shrink-0"
            :style="{ backgroundColor: resolvedColor }"
            aria-hidden="true"
          />
          <span
            class="truncate font-medium"
            :class="isUnassignedProject ? 'text-text-muted' : 'text-text-primary'"
          >
            {{ resolvedProjectLabel }}
          </span>
          <span
            v-if="resolvedTaskLabel"
            class="truncate text-xs font-normal text-text-muted"
          >
            · {{ resolvedTaskLabel }}
          </span>
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
      </button>

      <button
        v-else
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'tracker-project-trigger'"
        :title="$t('timer.projectSelect.changeProjectTooltip')"
        class="inline-flex flex-wrap items-center gap-1.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
        @click="handleTriggerClick"
      >
        <span class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 py-1 text-ui text-text-primary hover:border-signal/60 hover:bg-bg-hover transition-colors">
          <span
            class="h-2 w-2 shrink-0"
            :style="{ backgroundColor: resolvedColor }"
            aria-hidden="true"
          />
          <span>{{ resolvedProjectLabel }}</span>
        </span>

        <span
          v-if="resolvedTaskLabel"
          class="inline-flex items-center gap-1 border border-border-hairline bg-bg-primary px-2 py-1 text-xs font-medium text-text-muted hover:border-signal/60 hover:text-signal transition-colors"
        >
          <CheckSquare class="h-3.5 w-3.5 text-signal shrink-0" aria-hidden="true" />
          <span>{{ resolvedTaskLabel }}</span>
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tracker-project-popover"
        class="orbital-popover relative z-50 w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />
        <!-- Search Input -->
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-testid="tracker-project-search"
            :placeholder="$t('timer.projectSelect.searchPlaceholder')"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
            @keydown="handleSearchKeydown"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Projects Section -->
        <div class="border-b border-border-hairline px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {{ $t('timer.projectSelect.projectsSection') }}
        </div>

        <!-- Inline Toggl-Style Create Project Action -->
        <button
          v-if="creatableProjectName"
          type="button"
          data-testid="tracker-project-create"
          :disabled="creatingProject"
          class="flex w-full items-center justify-between gap-2 border-b border-border-hairline bg-signal-soft/60 px-3 py-2.5 text-left text-ui font-medium text-signal transition-colors hover:bg-signal-soft disabled:opacity-50"
          @click="handleCreateProjectInline"
        >
          <span class="inline-flex items-center gap-2 min-w-0 truncate">
            <Plus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span
              class="h-2.5 w-2.5 shrink-0"
              :style="{ backgroundColor: nextProjectColorPreview }"
              aria-hidden="true"
            />
            <span class="truncate">{{ $t('timer.projectSelect.createInline', { name: creatableProjectName }) }}</span>
          </span>
          <BrandKeycapBadge
            v-if="filteredProjects.length === 0"
            keys="Enter"
            size="sm"
          />
        </button>

        <div
          v-if="filteredProjects.length === 0 && !creatableProjectName"
          class="px-3 py-4 text-center text-ui text-text-muted"
        >
          {{ $t('timer.projectSelect.noMatches') }}
        </div>
        <ul v-else-if="filteredProjects.length > 0" class="max-h-48 overflow-y-auto divide-y divide-border-subtle">
          <li v-for="proj in filteredProjects" :key="proj.id">
            <button
              type="button"
              :data-testid="`tracker-project-option-${proj.id}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors hover:bg-bg-hover"
              :class="proj.id === projectId ? 'bg-signal-soft text-signal font-medium' : 'text-text-primary'"
              @click="handleSelectProject(proj)"
            >
              <span class="inline-flex items-center gap-2 min-w-0 truncate">
                <span
                  class="h-2.5 w-2.5 shrink-0"
                  :style="{ backgroundColor: proj.color }"
                />
                <span class="truncate">{{ displayProjectName(proj) }}</span>
              </span>

              <span class="inline-flex items-center gap-1.5 shrink-0">
                <span
                  v-if="proj.isBillableDefault"
                  class="border border-signal/40 bg-signal-soft px-1.5 py-0.5 text-xs font-medium text-signal"
                >
                  $
                </span>
                <Check v-if="proj.id === projectId" class="h-4 w-4 text-signal" />
              </span>
            </button>
          </li>
        </ul>

        <!-- Hierarchical Tasks Section (shown when active project has tasks) -->
        <template v-if="activeProjectTasks.length > 0 || taskId">
          <div class="border-y border-border-hairline bg-bg-primary/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {{ $t('timer.projectSelect.tasksSection') }}
          </div>
          <ul class="max-h-44 overflow-y-auto divide-y divide-border-subtle">
            <li>
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-ui transition-colors hover:bg-bg-hover"
                :class="!taskId ? 'text-signal font-medium' : 'text-text-muted'"
                @click="handleSelectTask(null)"
              >
                <span>{{ $t('timer.taskSelectorPlaceholder') }}</span>
                <Check v-if="!taskId" class="h-4 w-4 text-signal" />
              </button>
            </li>
            <li v-for="node in activeProjectTasks" :key="node.task.id">
              <button
                type="button"
                :data-testid="`tracker-task-option-${node.task.id}`"
                class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ui transition-colors hover:bg-bg-hover"
                :class="node.task.id === taskId ? 'bg-signal-soft text-signal font-medium' : 'text-text-primary'"
                @click="handleSelectTask(node.task.id)"
              >
                <span class="flex items-center gap-1.5 min-w-0 truncate">
                  <span class="truncate">
                    {{ node.depth === 1 ? '↳ ' : node.depth === 2 ? '↳↳ ' : '' }}{{ node.task.name }}
                  </span>
                  <AdoWorkItemTypeBadge
                    v-if="node.task.externalWorkItemId"
                    :work-item-type="node.task.externalWorkItemType"
                    :work-item-id="node.task.externalWorkItemId"
                    compact
                  />
                </span>
                <Check v-if="node.task.id === taskId" class="h-4 w-4 shrink-0 text-signal" />
              </button>
            </li>
          </ul>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
