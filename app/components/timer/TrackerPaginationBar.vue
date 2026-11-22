<script setup lang="ts">
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-vue-next';
import type { TrackerFeedWindow } from '~/domain/trackerFeed';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    window: TrackerFeedWindow;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const emit = defineEmits<{
  navigate: [pageIndex: number];
}>();

const prefsStore = usePreferencesStore();
const { formatDateKey, formatDuration } = useFormat(() => prefsStore.preferences);

const windowRangeLabel = computed(() => {
  const { oldestDateKey, newestDateKey } = props.window;
  if (!newestDateKey || !oldestDateKey) return '';
  const newest = formatDateKey(newestDateKey);
  if (oldestDateKey === newestDateKey) return newest;
  return `${formatDateKey(oldestDateKey)} – ${newest}`;
});

function goFirst() {
  if (props.window.hasPreviousPage) emit('navigate', 0);
}

function goPrevious() {
  if (props.window.hasPreviousPage) emit('navigate', props.window.pageIndex - 1);
}

function goNext() {
  if (props.window.hasNextPage) emit('navigate', props.window.pageIndex + 1);
}

function goLast() {
  if (props.window.hasNextPage) emit('navigate', props.window.totalPages - 1);
}
</script>

<template>
  <nav
    v-if="window.totalPages > 0"
    :aria-label="$t('timer.pagination.ariaLabel')"
    data-testid="tracker-pagination-bar"
    class="flex flex-wrap items-center justify-between gap-3 border border-border-hairline bg-bg-elevated px-4 py-2.5"
  >
    <!-- Active 7-Day Window Telemetry Summary -->
    <div class="flex flex-wrap items-center gap-2.5 text-xs font-mono">
      <span
        v-if="!compact"
        class="inline-flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
      >
        <Calendar class="h-3 w-3" />
        <span>{{ $t('timer.pagination.windowLabel') }}</span>
      </span>

      <span
        data-testid="tracker-pagination-range"
        class="tabular-telemetry font-semibold text-text-primary"
      >
        {{ windowRangeLabel }}
      </span>

      <span class="tabular-telemetry text-text-muted">
        {{ $t('timer.pagination.daysCount', { count: window.days.length }) }}
        ·
        {{ $t('timer.pagination.entriesCount', { count: window.windowLogsCount }) }}
        ·
        <strong class="text-text-primary">{{ formatDuration(window.windowTotalSeconds) }}</strong>
      </span>
    </div>

    <!-- Previous / Next Window Controls -->
    <div class="flex items-center gap-1.5">
      <button
        v-if="window.totalPages > 2"
        type="button"
        data-testid="tracker-pagination-first"
        :disabled="!window.hasPreviousPage"
        :aria-label="$t('timer.pagination.first')"
        :title="$t('timer.pagination.first')"
        class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        @click="goFirst"
      >
        <ChevronsLeft class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        data-testid="tracker-pagination-prev"
        :disabled="!window.hasPreviousPage"
        class="inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        @click="goPrevious"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
        <span>{{ $t('timer.pagination.previous') }}</span>
      </button>

      <span
        data-testid="tracker-pagination-page"
        class="tabular-telemetry border border-border-hairline bg-bg-primary px-2.5 py-1.5 text-xs font-mono text-text-muted"
      >
        {{ $t('timer.pagination.pageOf', { page: window.pageNumber, total: window.totalPages }) }}
      </span>

      <button
        type="button"
        data-testid="tracker-pagination-next"
        :disabled="!window.hasNextPage"
        class="inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        @click="goNext"
      >
        <span>{{ $t('timer.pagination.next') }}</span>
        <ChevronRight class="h-3.5 w-3.5" />
      </button>

      <button
        v-if="window.totalPages > 2"
        type="button"
        data-testid="tracker-pagination-last"
        :disabled="!window.hasNextPage"
        :aria-label="$t('timer.pagination.last')"
        :title="$t('timer.pagination.last')"
        class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        @click="goLast"
      >
        <ChevronsRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </nav>
</template>
