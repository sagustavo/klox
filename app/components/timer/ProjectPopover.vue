<script setup lang="ts">
import { Check, ChevronDown, FolderKanban, Plus, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { PROJECT_COLOR_PALETTE } from '~/domain/invariants';
import type { EntityId, Project } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

const props = withDefaults(
  defineProps<{
    projectId: EntityId;
    projectNameSnapshot?: string;
    projectColorSnapshot?: string;
    variant?: 'row' | 'command' | 'field';
    allowCreateProject?: boolean;
    dataTour?: string;
    stopPropagation?: boolean;
    testId?: string;
  }>(),
  {
    projectNameSnapshot: undefined,
    projectColorSnapshot: undefined,
    variant: 'row',
    allowCreateProject: true,
    dataTour: undefined,
    stopPropagation: false,
    testId: undefined,
  }
);

const emit = defineEmits<{
  select: [projectId: EntityId];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();

const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
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

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const sorted = catalogStore.sortedProjects;
  if (!q) return sorted;
  return sorted.filter((proj) => displayProjectName(proj).toLowerCase().includes(q));
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

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    const idx = catalogStore.sortedProjects.findIndex((p) => p.id === props.projectId);
    highlightedIdx.value = idx >= 0 ? idx : 0;
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
    emit('select', created.id);
    searchQuery.value = '';
    open.value = false;
  } finally {
    creatingProject.value = false;
  }
}

function handleSearchKeydown(event: KeyboardEvent) {
  const list = filteredProjects.value;
  if (event.key === 'ArrowDown' && list.length > 0) {
    event.preventDefault();
    highlightedIdx.value = (highlightedIdx.value + 1) % list.length;
  } else if (event.key === 'ArrowUp' && list.length > 0) {
    event.preventDefault();
    highlightedIdx.value = highlightedIdx.value <= 0 ? list.length - 1 : highlightedIdx.value - 1;
  } else if (event.key === 'Enter') {
    if (creatableProjectName.value && (list.length === 0 || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleCreateProjectInline();
      return;
    }
    const chosen = list[highlightedIdx.value];
    if (chosen) {
      event.preventDefault();
      handleSelectProject(chosen);
    }
  }
}

function handleTriggerClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
}

function handleSelectProject(project: Project) {
  emit('select', project.id);
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
        :aria-label="`${$t('timer.projectLabel')}: ${resolvedProjectLabel}`"
        :title="`${$t('timer.projectLabel')}: ${resolvedProjectLabel}`"
        class="btn-press inline-flex h-9 max-w-[170px] sm:max-w-[200px] items-center gap-2 border border-transparent bg-transparent px-2.5 text-left text-ui transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-signal data-[state=open]:bg-bg-hover"
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
      </button>

      <button
        v-else-if="variant === 'field'"
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'field-project-trigger'"
        :aria-label="`${$t('timer.projectLabel')}: ${resolvedProjectLabel}`"
        :title="`${$t('timer.projectLabel')}: ${resolvedProjectLabel}`"
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
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
      </button>

      <button
        v-else
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'tracker-project-trigger'"
        :title="$t('timer.projectSelect.changeProjectOnlyTooltip')"
        class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 py-1 text-ui text-text-primary hover:border-signal/60 hover:bg-bg-hover transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
        @click="handleTriggerClick"
      >
        <span
          class="h-2 w-2 shrink-0"
          :style="{ backgroundColor: resolvedColor }"
          aria-hidden="true"
        />
        <span>{{ resolvedProjectLabel }}</span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tracker-project-popover"
        class="orbital-popover relative z-50 w-72 sm:w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-testid="tracker-project-search"
            :placeholder="$t('timer.projectSelect.searchProjectsOnlyPlaceholder')"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
            @keydown="handleSearchKeydown"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div class="flex items-center gap-1.5 border-b border-border-hairline px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <FolderKanban class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <span>{{ $t('timer.projectSelect.projectsSection') }}</span>
        </div>

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
        <ul v-else-if="filteredProjects.length > 0" class="max-h-60 overflow-y-auto divide-y divide-border-subtle">
          <li v-for="(proj, idx) in filteredProjects" :key="proj.id">
            <button
              type="button"
              :data-testid="`tracker-project-option-${proj.id}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                proj.id === projectId ? 'bg-signal-soft/70 text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
              @click="handleSelectProject(proj)"
            >
              <span class="inline-flex items-center gap-2 min-w-0 truncate">
                <span
                  class="h-2.5 w-2.5 shrink-0"
                  :style="{ backgroundColor: proj.color }"
                  aria-hidden="true"
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
                <Check v-if="proj.id === projectId" class="h-4 w-4 text-signal" aria-hidden="true" />
              </span>
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
