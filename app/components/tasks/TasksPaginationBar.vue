<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
} from 'lucide-vue-next';
import {
  TASK_PAGE_SIZE_OPTIONS,
  type TaskPaginationWindow,
} from '~/domain/invariants';

const props = withDefaults(
  defineProps<{
    window: TaskPaginationWindow;
    hasExpandableParents?: boolean;
    allExpanded?: boolean;
    compact?: boolean;
  }>(),
  {
    hasExpandableParents: false,
    allExpanded: false,
    compact: false,
  }
);

const emit = defineEmits<{
  navigate: [pageIndex: number];
  'update:pageSize': [pageSize: number];
  toggleAllExpanded: [];
}>();

function handlePageSizeChange(event: Event) {
  const raw = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(raw) && raw > 0) {
    emit('update:pageSize', raw);
  }
}
</script>

<template>
  <nav
    v-if="window.totalItems > 0"
    :aria-label="$t('tasks.pagination.ariaLabel')"
    data-testid="tasks-pagination-bar"
    class="flex flex-wrap items-center justify-between gap-2.5 border border-border-hairline bg-bg-primary/60 px-3.5 py-2.5 text-xs"
  >
    <div class="flex flex-wrap items-center gap-3 text-text-muted">
      <span class="tabular-telemetry font-medium text-text-primary">
        {{
          $t('tasks.pagination.showingRange', {
            start: window.startIndex + 1,
            end: window.endIndex,
            total: window.totalItems,
          })
        }}
      </span>

      <label
        v-if="!compact"
        class="inline-flex items-center gap-1.5 text-text-muted"
      >
        <span>{{ $t('tasks.pagination.perPageLabel') }}</span>
        <select
          :value="window.pageSize"
          data-testid="tasks-page-size-select"
          :aria-label="$t('tasks.pagination.perPageAria')"
          class="tabular-telemetry h-8 border border-border-input bg-bg-elevated px-2 text-xs font-medium text-text-primary focus:border-signal focus:outline-none"
          @change="handlePageSizeChange"
        >
          <option v-for="opt in TASK_PAGE_SIZE_OPTIONS" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-if="!compact && hasExpandableParents"
        type="button"
        data-testid="tasks-toggle-all-expanded"
        class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-2.5 text-xs font-medium text-text-primary hover:border-signal/60 hover:bg-bg-hover transition-colors"
        @click="emit('toggleAllExpanded')"
      >
        <ChevronsDownUp v-if="allExpanded" class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
        <ChevronsUpDown v-else class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
        <span>
          {{ allExpanded ? $t('tasks.pagination.collapseAll') : $t('tasks.pagination.expandAll') }}
        </span>
      </button>

      <template v-if="window.totalPages > 1">
        <button
          v-if="window.totalPages > 2"
          type="button"
          :disabled="!window.hasPreviousPage"
          :aria-label="$t('tasks.pagination.first')"
          :title="$t('tasks.pagination.first')"
          class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          @click="emit('navigate', 0)"
        >
          <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          data-testid="tasks-pagination-prev"
          :disabled="!window.hasPreviousPage"
          class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          @click="emit('navigate', window.pageIndex - 1)"
        >
          <ChevronLeft class="h-3.5 w-3.5" aria-hidden="true" />
          <span class="hidden sm:inline">{{ $t('timer.pagination.previous') }}</span>
        </button>

        <span
          data-testid="tasks-pagination-page"
          class="tabular-telemetry inline-flex h-8 items-center border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-muted"
        >
          {{ $t('timer.pagination.pageOf', { page: window.pageNumber, total: window.totalPages }) }}
        </span>

        <button
          type="button"
          data-testid="tasks-pagination-next"
          :disabled="!window.hasNextPage"
          class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          @click="emit('navigate', window.pageIndex + 1)"
        >
          <span class="hidden sm:inline">{{ $t('timer.pagination.next') }}</span>
          <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          v-if="window.totalPages > 2"
          type="button"
          :disabled="!window.hasNextPage"
          :aria-label="$t('tasks.pagination.last')"
          :title="$t('tasks.pagination.last')"
          class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          @click="emit('navigate', window.totalPages - 1)"
        >
          <ChevronsRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </template>
    </div>
  </nav>
</template>
