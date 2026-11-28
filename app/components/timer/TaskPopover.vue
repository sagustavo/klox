<script setup lang="ts">
import { Check, CheckSquare, ChevronDown, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import type { TaskTreeNode } from '~/domain/invariants';
import type { EntityId } from '~/domain/types';
import { useCatalogStore } from '~/stores/catalog';

const props = withDefaults(
  defineProps<{
    projectId: EntityId;
    taskId?: EntityId;
    taskNameSnapshot?: string;
    variant?: 'row' | 'command' | 'field';
    stopPropagation?: boolean;
    testId?: string;
  }>(),
  {
    taskId: undefined,
    taskNameSnapshot: undefined,
    variant: 'row',
    stopPropagation: false,
    testId: undefined,
  }
);

const emit = defineEmits<{
  select: [taskId: EntityId | null];
}>();

const { t } = useI18n();
const catalogStore = useCatalogStore();

const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

const allProjectTasks = computed<TaskTreeNode[]>(() =>
  catalogStore.getFlattenedTasksForProject(props.projectId)
);

const filteredTasks = computed<TaskTreeNode[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return allProjectTasks.value;
  return allProjectTasks.value.filter((node) => {
    const adoId = (node.task.externalWorkItemId ?? '').trim().toLowerCase();
    return (
      node.task.name.toLowerCase().includes(q) ||
      node.hierarchicalLabel.toLowerCase().includes(q) ||
      adoId.includes(q) ||
      (adoId && `ab#${adoId}`.includes(q))
    );
  });
});

// Concise badge display: "AB#31 / 3101" for hierarchical ADO tasks, or leaf task name for personal tasks
const compactTaskLabel = computed(() => {
  if (!props.taskId && !props.taskNameSnapshot) return null;
  if (props.taskId) {
    const compact = catalogStore.getTaskCompactLabel(props.taskId);
    if (compact) return compact;
  }
  return props.taskNameSnapshot || null;
});

const fullHierarchyTooltip = computed(() => {
  if (!props.taskId && !props.taskNameSnapshot) return t('timer.taskSelect.pickTaskTooltip');
  const full = props.taskId ? catalogStore.getTaskHierarchicalLabel(props.taskId) : '';
  return full || props.taskNameSnapshot || t('timer.taskSelect.pickTaskTooltip');
});

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    highlightedIdx.value = 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

watch(filteredTasks, (next) => {
  if (highlightedIdx.value >= next.length) {
    highlightedIdx.value = Math.max(0, next.length - 1);
  }
});

function handleTriggerClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
}

function handleSelectTask(nextTaskId: EntityId | null) {
  emit('select', nextTaskId);
  open.value = false;
}

function handleSearchKeydown(event: KeyboardEvent) {
  const list = filteredTasks.value;
  if (list.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIdx.value = (highlightedIdx.value + 1) % list.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIdx.value = highlightedIdx.value <= 0 ? list.length - 1 : highlightedIdx.value - 1;
  } else if (event.key === 'Enter') {
    const chosen = list[highlightedIdx.value];
    if (chosen) {
      event.preventDefault();
      handleSelectTask(chosen.task.id);
    }
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <!-- Borderless Command Trigger (CommandTimerBar) -->
      <button
        v-if="variant === 'command'"
        type="button"
        :data-testid="testId ?? 'command-task-trigger'"
        :aria-label="fullHierarchyTooltip"
        :title="fullHierarchyTooltip"
        class="btn-press inline-flex h-9 max-w-[180px] items-center gap-1.5 border border-transparent bg-transparent px-2 text-xs font-medium transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-signal data-[state=open]:bg-signal-soft data-[state=open]:text-signal"
        :class="compactTaskLabel ? 'text-signal' : 'text-text-muted hover:text-text-primary'"
        @click="handleTriggerClick"
      >
        <CheckSquare class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="tabular-telemetry truncate">
          {{ compactTaskLabel || $t('timer.taskSelect.shortButton') }}
        </span>
      </button>

      <!-- Form Field Trigger (Manual Activity Form) -->
      <button
        v-else-if="variant === 'field'"
        type="button"
        :data-testid="testId ?? 'field-task-trigger'"
        :aria-label="fullHierarchyTooltip"
        :title="fullHierarchyTooltip"
        class="inline-flex h-10 w-full items-center justify-between gap-2 border border-border-input bg-bg-primary px-3 text-left text-ui transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
        @click="handleTriggerClick"
      >
        <span class="inline-flex items-center gap-2 min-w-0 truncate">
          <CheckSquare class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          <span
            class="tabular-telemetry truncate"
            :class="compactTaskLabel ? 'font-medium text-text-primary' : 'text-text-muted'"
          >
            {{ compactTaskLabel || $t('timer.taskSelectorPlaceholder') }}
          </span>
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
      </button>

      <!-- Row Trigger: Compact Badge when Linked, Hover-Reveal Icon when Unlinked -->
      <button
        v-else-if="compactTaskLabel"
        type="button"
        :data-testid="testId ?? 'tracker-task-trigger'"
        :title="fullHierarchyTooltip"
        class="tabular-telemetry inline-flex max-w-[200px] items-center gap-1 border border-border-hairline bg-bg-primary px-2 py-1 text-xs font-medium text-text-primary hover:border-signal/60 hover:text-signal transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
        @click="handleTriggerClick"
      >
        <CheckSquare class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
        <span class="truncate">{{ compactTaskLabel }}</span>
      </button>

      <button
        v-else-if="allProjectTasks.length > 0"
        type="button"
        :data-testid="testId ?? 'tracker-task-empty-trigger'"
        :aria-label="$t('timer.taskSelect.pickTaskTooltip')"
        :title="$t('timer.taskSelect.pickTaskTooltip')"
        class="row-action-ghost hover:text-signal"
        @click="handleTriggerClick"
      >
        <CheckSquare class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tracker-task-popover"
        class="orbital-popover relative z-50 w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-testid="tracker-task-search"
            :placeholder="$t('timer.taskSelect.searchPlaceholder')"
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

        <div class="border-b border-border-hairline px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {{ $t('timer.projectSelect.tasksSection') }}
        </div>

        <div
          v-if="allProjectTasks.length === 0"
          class="px-3 py-4 text-center text-ui text-text-muted"
        >
          {{ $t('timer.taskSelect.emptyInProject') }}
        </div>

        <ul v-else class="max-h-60 overflow-y-auto divide-y divide-border-subtle">
          <li>
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-left text-ui transition-colors hover:bg-bg-hover"
              :class="!taskId ? 'text-signal font-medium' : 'text-text-muted'"
              @click="handleSelectTask(null)"
            >
              <span>{{ $t('timer.taskSelectorPlaceholder') }}</span>
              <Check v-if="!taskId" class="h-4 w-4 text-signal" aria-hidden="true" />
            </button>
          </li>

          <li
            v-if="filteredTasks.length === 0"
            class="px-3 py-4 text-center text-ui text-text-muted"
          >
            {{ $t('timer.taskSelect.noMatches', { query: searchQuery }) }}
          </li>

          <li v-for="(node, idx) in filteredTasks" :key="node.task.id">
            <button
              type="button"
              :data-testid="`tracker-task-option-${node.task.id}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ui transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                node.task.id === taskId ? 'bg-signal-soft text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
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
              <Check v-if="node.task.id === taskId" class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
