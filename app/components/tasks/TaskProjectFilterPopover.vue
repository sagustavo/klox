<script setup lang="ts">
import { Check, ChevronDown, FolderKanban, GitBranch, Plus, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import type { EntityId, Project } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

const props = withDefaults(
  defineProps<{
    modelValue: EntityId;
    unsyncedHoursByProject?: ReadonlyMap<EntityId, number>;
    testId?: string;
  }>(),
  {
    unsyncedHoursByProject: () => new Map(),
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [projectId: EntityId];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const adoStore = useAdoStore();

const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
const creating = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedProject = computed(() => catalogStore.getProjectById(props.modelValue));

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function projectTaskCount(projectId: EntityId): number {
  return catalogStore.getTasksForProject(projectId).length;
}

function projectUnsyncedHours(projectId: EntityId): number {
  return props.unsyncedHoursByProject.get(projectId) ?? 0;
}

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return catalogStore.sortedProjects;
  return catalogStore.sortedProjects.filter((proj) =>
    displayProjectName(proj).toLowerCase().includes(q)
  );
});

const creatableProjectName = computed(() => {
  if (!authStore.user) return '';
  const trimmed = searchQuery.value.trim();
  if (!trimmed || trimmed.length > 120) return '';
  const lower = trimmed.toLowerCase();
  const exists = catalogStore.sortedProjects.some(
    (p) => displayProjectName(p).trim().toLowerCase() === lower || p.name.trim().toLowerCase() === lower
  );
  return exists ? '' : trimmed;
});

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    const activeIdx = catalogStore.sortedProjects.findIndex((p) => p.id === props.modelValue);
    highlightedIdx.value = activeIdx >= 0 ? activeIdx : 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

watch(filteredProjects, (next) => {
  if (highlightedIdx.value >= next.length) {
    highlightedIdx.value = Math.max(0, next.length - 1);
  }
});

function selectProject(projectId: EntityId) {
  emit('update:modelValue', projectId);
  open.value = false;
}

async function handleCreateProjectInline() {
  const name = creatableProjectName.value;
  if (!name || !authStore.user || creating.value) return;

  creating.value = true;
  try {
    const created = await catalogStore.createProject({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      name,
    });
    selectProject(created.id);
  } finally {
    creating.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  const list = filteredProjects.value;
  if (event.key === 'ArrowDown') {
    if (list.length === 0) return;
    event.preventDefault();
    highlightedIdx.value = (highlightedIdx.value + 1) % list.length;
  } else if (event.key === 'ArrowUp') {
    if (list.length === 0) return;
    event.preventDefault();
    highlightedIdx.value =
      highlightedIdx.value <= 0 ? list.length - 1 : highlightedIdx.value - 1;
  } else if (event.key === 'Enter') {
    if (creatableProjectName.value && (list.length === 0 || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleCreateProjectInline();
      return;
    }
    const target = list[highlightedIdx.value];
    if (target) {
      event.preventDefault();
      selectProject(target.id);
    }
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :data-testid="testId ?? 'tasks-project-filter-trigger'"
        class="btn-press inline-flex h-10 min-w-0 max-w-full items-center justify-between gap-2.5 border border-border-input bg-bg-primary px-3 text-left text-ui transition-colors hover:border-signal/60 hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span
            v-if="selectedProject"
            class="h-3 w-3 shrink-0"
            :style="{ backgroundColor: selectedProject.color }"
            aria-hidden="true"
          />
          <FolderKanban v-else class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          <span class="truncate font-medium text-text-primary">
            {{ selectedProject ? displayProjectName(selectedProject) : $t('tasks.projectScopeTitle') }}
          </span>
          <GitBranch
            v-if="selectedProject && adoStore.getConnectionForProject(selectedProject.id)"
            class="h-3.5 w-3.5 shrink-0 text-signal"
            aria-hidden="true"
          />
        </span>

        <span class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="selectedProject && projectUnsyncedHours(selectedProject.id) > 0"
            class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-500"
          >
            +{{ projectUnsyncedHours(selectedProject.id).toFixed(2) }}h
          </span>
          <span
            v-if="selectedProject"
            class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted"
          >
            {{ projectTaskCount(selectedProject.id) }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tasks-project-filter-popover"
        class="orbital-popover relative z-50 w-72 sm:w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @keydown="handleKeydown"
      >
        <div class="signal-line" aria-hidden="true" />

        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('tasks.projectFilter.searchPlaceholder')"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            :aria-label="$t('confirm.cancelAction')"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <button
          v-if="creatableProjectName"
          type="button"
          :disabled="creating"
          class="flex w-full items-center justify-between gap-2 border-b border-border-hairline bg-signal-soft/60 px-3 py-2.5 text-left text-ui font-medium text-signal transition-colors hover:bg-signal-soft disabled:opacity-50"
          @click="handleCreateProjectInline"
        >
          <span class="inline-flex items-center gap-2 min-w-0 truncate">
            <Plus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ $t('tasks.projectFilter.createInline', { name: creatableProjectName }) }}</span>
          </span>
          <BrandKeycapBadge v-if="filteredProjects.length === 0" keys="Enter" size="sm" />
        </button>

        <div
          v-if="filteredProjects.length === 0 && !creatableProjectName"
          class="px-3 py-4 text-center text-ui text-text-muted"
        >
          {{ $t('tasks.projectFilter.noMatches', { query: searchQuery }) }}
        </div>

        <ul
          v-else-if="filteredProjects.length > 0"
          role="listbox"
          class="max-h-72 overflow-y-auto divide-y divide-border-subtle py-0.5"
        >
          <li
            v-for="(proj, idx) in filteredProjects"
            :key="proj.id"
            role="option"
            :aria-selected="proj.id === modelValue"
          >
            <button
              type="button"
              :data-testid="`tasks-project-option-${proj.id}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                proj.id === modelValue ? 'text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
              @click="selectProject(proj.id)"
            >
              <span class="flex items-center gap-2.5 min-w-0">
                <span
                  class="h-3 w-3 shrink-0"
                  :style="{ backgroundColor: proj.color }"
                  aria-hidden="true"
                />
                <span class="truncate">{{ displayProjectName(proj) }}</span>
                <GitBranch
                  v-if="adoStore.getConnectionForProject(proj.id)"
                  class="h-3.5 w-3.5 shrink-0 text-signal"
                  aria-hidden="true"
                />
              </span>

              <span class="flex items-center gap-1.5 shrink-0">
                <span
                  v-if="projectUnsyncedHours(proj.id) > 0"
                  class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-500"
                >
                  +{{ projectUnsyncedHours(proj.id).toFixed(2) }}h
                </span>
                <span class="tabular-telemetry border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted">
                  {{ projectTaskCount(proj.id) }}
                </span>
                <Check
                  v-if="proj.id === modelValue"
                  class="h-3.5 w-3.5 text-signal"
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
