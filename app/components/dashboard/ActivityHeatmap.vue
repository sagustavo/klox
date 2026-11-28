<script setup lang="ts">
import { Activity, Calendar, Flame, Trophy } from 'lucide-vue-next';
import type { DateKeyBounds } from '~/domain/aggregation';
import {
  buildActivityHeatmap,
  extractAvailableHeatmapYears,
} from '~/domain/heatmap';
import type {
  DateRangePreset,
  HeatmapDayCell,
  HeatmapIntensityLevel,
  HeatmapRangeSelection,
  TimeLog,
} from '~/domain/types';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';

const props = withDefaults(
  defineProps<{
    filteredLogs: readonly TimeLog[];
    dimensionFilteredLogs: readonly TimeLog[];
    bounds: DateKeyBounds;
    preset: DateRangePreset;
    hasDimensionFilters?: boolean;
  }>(),
  {
    hasDimensionFilters: false,
  }
);

const { t } = useI18n();
const prefsStore = usePreferencesStore();
const timeLogsStore = useTimeLogsStore();
const { formatDuration, formatDecimalHours, formatDateKey } = useFormat(
  () => prefsStore.preferences
);

const selectedRange = ref<HeatmapRangeSelection>('rolling_365');
const tooltipId = useId();

const availableYears = computed(() =>
  extractAvailableHeatmapYears(
    props.dimensionFilteredLogs,
    prefsStore.preferences.timeZone
  )
);

watch(availableYears, (years) => {
  if (typeof selectedRange.value === 'number' && !years.includes(selectedRange.value)) {
    selectedRange.value = 'rolling_365';
  }
});

// Preserve Last 12 months on initial load/hydration; switch to Filtered Range when the user changes dashboard date filters
watch(
  () => props.preset,
  (next, prev) => {
    if (prev && next !== prev) {
      selectedRange.value = 'filtered';
    }
  }
);

watch(
  [() => props.bounds.startDateKey, () => props.bounds.endDateKey],
  () => {
    if (props.preset === 'custom') {
      selectedRange.value = 'filtered';
    }
  }
);

const activeLogsSource = computed(() =>
  selectedRange.value === 'filtered' ? props.filteredLogs : props.dimensionFilteredLogs
);

const heatmap = computed(() =>
  buildActivityHeatmap({
    logs: activeLogsSource.value,
    timeZone: prefsStore.preferences.timeZone,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
    range: selectedRange.value,
    customBounds: props.bounds,
  })
);

const intlLocale = computed(() =>
  prefsStore.preferences.locale === 'pt-br' ? 'pt-BR' : 'en-US'
);

const monthFormatter = computed(
  () =>
    new Intl.DateTimeFormat(intlLocale.value, {
      month: 'short',
      timeZone: 'UTC',
    })
);

const weekdayFormatter = computed(
  () =>
    new Intl.DateTimeFormat(intlLocale.value, {
      weekday: 'short',
      timeZone: 'UTC',
    })
);

function formatMonthLabel(year: number, monthIndex: number): string {
  const raw = monthFormatter.value.format(new Date(Date.UTC(year, monthIndex, 15)));
  return raw.replace(/\.$/, '');
}

const weekdayRowLabels = computed(() =>
  heatmap.value.weekdayOrder.map((dayIdx, rowIdx) => {
    if (rowIdx !== 1 && rowIdx !== 3 && rowIdx !== 5) return '';
    // 2026-11-01 is Sunday (0)
    const raw = weekdayFormatter.value.format(new Date(Date.UTC(2026, 10, 1 + dayIdx)));
    return raw.replace(/\.$/, '').slice(0, 3);
  })
);

const LEVEL_CLASSES: Record<HeatmapIntensityLevel, string> = {
  0: 'border-border-hairline bg-bg-primary hover:border-signal/60',
  1: 'border-signal/30 bg-[oklch(var(--signal-ch)/0.24)] hover:border-signal',
  2: 'border-signal/45 bg-[oklch(var(--signal-ch)/0.48)] hover:border-signal',
  3: 'border-signal/70 bg-[oklch(var(--signal-ch)/0.74)] hover:border-signal',
  4: 'border-signal bg-[oklch(var(--signal-ch)/1)] hover:brightness-110',
};

const inRangeDateKeys = computed(() => {
  const keys: string[] = [];
  for (const week of heatmap.value.weeks) {
    for (const cell of week) {
      if (cell.inRange) keys.push(cell.dateKey);
    }
  }
  return keys;
});

const rovingDateKey = ref<string>('');
watch(
  heatmap,
  (data) => {
    if (rovingDateKey.value && inRangeDateKeys.value.includes(rovingDateKey.value)) {
      return;
    }
    let fallbackKey = '';
    for (const week of data.weeks) {
      for (const cell of week) {
        if (cell.isToday && cell.inRange) {
          rovingDateKey.value = cell.dateKey;
          return;
        }
        if (cell.inRange) fallbackKey = cell.dateKey;
      }
    }
    rovingDateKey.value = fallbackKey;
  },
  { immediate: true }
);

function formatCellAriaLabel(cell: HeatmapDayCell): string {
  const dateText = formatDateKey(cell.dateKey);
  if (cell.totalSeconds <= 0) {
    return `${dateText} — ${t('heatmap.noTrackedTime')}`;
  }
  const countText =
    cell.logCount === 1
      ? t('heatmap.entriesSingular', { count: 1 })
      : t('heatmap.entriesPlural', { count: cell.logCount });
  return `${dateText} — ${formatDuration(cell.totalSeconds)} (${countText})`;
}

// Single shared accessible floating tooltip (WCAG 1.4.13)
const activeCell = ref<HeatmapDayCell | null>(null);
const activeTriggerEl = ref<HTMLElement | null>(null);
const tooltipStyle = ref<Record<string, string>>({});
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const isTooltipHovered = ref(false);
const gridRef = ref<HTMLElement | null>(null);

function cancelHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function updateTooltipPosition(triggerEl: HTMLElement) {
  const rect = triggerEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const clampedLeft = Math.min(Math.max(centerX, 110), window.innerWidth - 110);
  const placeBelow = rect.top < 78;

  tooltipStyle.value = placeBelow
    ? {
        top: `${Math.round(rect.bottom + 8)}px`,
        left: `${Math.round(clampedLeft)}px`,
        transform: 'translateX(-50%)',
      }
    : {
        top: `${Math.round(rect.top - 8)}px`,
        left: `${Math.round(clampedLeft)}px`,
        transform: 'translate(-50%, -100%)',
      };
}

function showTooltip(cell: HeatmapDayCell, targetEl: HTMLElement) {
  cancelHideTimer();
  activeCell.value = cell;
  activeTriggerEl.value = targetEl;
  updateTooltipPosition(targetEl);
}

function scheduleHideTooltip() {
  cancelHideTimer();
  hideTimer = setTimeout(() => {
    if (!isTooltipHovered.value) {
      activeCell.value = null;
      activeTriggerEl.value = null;
    }
  }, 110);
}

function hideTooltipImmediate() {
  cancelHideTimer();
  isTooltipHovered.value = false;
  activeCell.value = null;
  activeTriggerEl.value = null;
}

function handleCellPointerEnter(cell: HeatmapDayCell, event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  const el = event.currentTarget as HTMLElement | null;
  if (el) showTooltip(cell, el);
}

function handleCellFocus(cell: HeatmapDayCell, event: FocusEvent) {
  rovingDateKey.value = cell.dateKey;
  const el = event.currentTarget as HTMLElement | null;
  if (el) showTooltip(cell, el);
}

function handleCellClick(cell: HeatmapDayCell, event: MouseEvent) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  if (activeCell.value?.dateKey === cell.dateKey) {
    hideTooltipImmediate();
  } else {
    rovingDateKey.value = cell.dateKey;
    showTooltip(cell, el);
  }
}

function focusCellByDateKey(targetKey: string) {
  if (!targetKey || !gridRef.value) return;
  const targetBtn = gridRef.value.querySelector<HTMLButtonElement>(
    `button[data-date-key="${targetKey}"]`
  );
  if (targetBtn) {
    rovingDateKey.value = targetKey;
    targetBtn.focus();
  }
}

function handleCellKeydown(
  weekIdx: number,
  dayIdx: number,
  cell: HeatmapDayCell,
  event: KeyboardEvent
) {
  if (event.key === 'Escape') {
    if (activeCell.value) {
      event.preventDefault();
      hideTooltipImmediate();
    }
    return;
  }

  let targetCell: HeatmapDayCell | undefined;
  const weeks = heatmap.value.weeks;

  if (event.key === 'ArrowRight') {
    for (let w = weekIdx + 1; w < weeks.length; w++) {
      const candidate = weeks[w]?.[dayIdx];
      if (candidate?.inRange) {
        targetCell = candidate;
        break;
      }
    }
  } else if (event.key === 'ArrowLeft') {
    for (let w = weekIdx - 1; w >= 0; w--) {
      const candidate = weeks[w]?.[dayIdx];
      if (candidate?.inRange) {
        targetCell = candidate;
        break;
      }
    }
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const flatIdx = inRangeDateKeys.value.indexOf(cell.dateKey);
    const nextKey = inRangeDateKeys.value[flatIdx + delta];
    if (nextKey) {
      event.preventDefault();
      focusCellByDateKey(nextKey);
      return;
    }
  } else if (event.key === 'Home') {
    const firstKey = inRangeDateKeys.value[0];
    if (firstKey) {
      event.preventDefault();
      focusCellByDateKey(firstKey);
    }
    return;
  } else if (event.key === 'End') {
    const lastKey = inRangeDateKeys.value[inRangeDateKeys.value.length - 1];
    if (lastKey) {
      event.preventDefault();
      focusCellByDateKey(lastKey);
    }
    return;
  }

  if (targetCell) {
    event.preventDefault();
    focusCellByDateKey(targetCell.dateKey);
  }
}

function handleOutsideClick(event: MouseEvent) {
  if (!activeCell.value || !gridRef.value) return;
  const target = event.target as Node | null;
  if (target && !gridRef.value.contains(target)) {
    hideTooltipImmediate();
  }
}

function handleWindowScrollOrResize() {
  if (activeCell.value && activeTriggerEl.value) {
    updateTooltipPosition(activeTriggerEl.value);
  }
}

onMounted(() => {
  window.addEventListener('click', handleOutsideClick);
  window.addEventListener('scroll', handleWindowScrollOrResize, true);
  window.addEventListener('resize', handleWindowScrollOrResize);
});

onBeforeUnmount(() => {
  cancelHideTimer();
  window.removeEventListener('click', handleOutsideClick);
  window.removeEventListener('scroll', handleWindowScrollOrResize, true);
  window.removeEventListener('resize', handleWindowScrollOrResize);
});
</script>

<template>
  <UiInstrumentPanel signal-line data-testid="dashboard-activity-heatmap">
    <!-- Header + Reactive Range Switcher -->
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-border-hairline pb-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <Activity class="h-4 w-4 text-signal" aria-hidden="true" />
          <h2 class="display-wide text-base sm:text-lg text-text-primary">
            {{ $t('heatmap.title') }}
          </h2>
          <span
            v-if="hasDimensionFilters"
            data-testid="heatmap-filtered-badge"
            class="border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal"
          >
            {{ $t('heatmap.filteredBadge') }}
          </span>
          <span
            v-if="timeLogsStore.streaming"
            class="tabular-telemetry border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal"
          >
            {{ $t('heatmap.syncing') }}
          </span>
        </div>
        <p class="mt-1 text-sm text-text-muted">
          {{ $t('heatmap.dashboardSubtitle') }}
        </p>
      </div>

      <!-- Rolling 12m (default) + Filtered Range + Year Selector Pills -->
      <div
        role="group"
        :aria-label="$t('heatmap.rangeSelectorAria')"
        class="flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          data-testid="heatmap-range-rolling"
          class="btn-press h-8 border px-3 text-xs font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          :class="
            selectedRange === 'rolling_365'
              ? 'border-signal bg-signal-soft text-signal'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:bg-bg-hover hover:text-text-primary'
          "
          :aria-pressed="selectedRange === 'rolling_365'"
          @click="selectedRange = 'rolling_365'"
        >
          {{ $t('heatmap.rolling12m') }}
        </button>

        <button
          type="button"
          data-testid="heatmap-range-filtered"
          class="btn-press h-8 border px-3 text-xs font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          :class="
            selectedRange === 'filtered'
              ? 'border-signal bg-signal-soft text-signal'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:bg-bg-hover hover:text-text-primary'
          "
          :aria-pressed="selectedRange === 'filtered'"
          @click="selectedRange = 'filtered'"
        >
          {{ $t('heatmap.filteredRange') }}
        </button>

        <button
          v-for="yr in availableYears"
          :key="yr"
          type="button"
          class="btn-press tabular-telemetry h-8 border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          :class="
            selectedRange === yr
              ? 'border-signal bg-signal-soft text-signal'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:bg-bg-hover hover:text-text-primary'
          "
          :aria-pressed="selectedRange === yr"
          @click="selectedRange = yr"
        >
          {{ yr }}
        </button>
      </div>
    </div>

    <!-- Summary Telemetry KPI Strip -->
    <div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="border border-border-hairline bg-bg-primary p-3.5">
        <div class="label-eyebrow text-text-muted">
          {{ $t('heatmap.totalTracked') }}
        </div>
        <div class="display-wide tabular-telemetry mt-1.5 text-lg sm:text-xl text-text-primary">
          {{ formatDuration(heatmap.summary.totalSeconds) }}
        </div>
        <div class="tabular-telemetry mt-0.5 text-xs text-text-faint">
          {{ formatDecimalHours(heatmap.summary.totalSeconds) }} h
        </div>
      </div>

      <div class="border border-border-hairline bg-bg-primary p-3.5">
        <div class="label-eyebrow flex items-center gap-1.5 text-text-muted">
          <Calendar class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <span>{{ $t('heatmap.activeDays') }}</span>
        </div>
        <div class="display-wide tabular-telemetry mt-1.5 text-lg sm:text-xl text-text-primary">
          {{ heatmap.summary.activeDays }}
        </div>
        <div class="tabular-telemetry mt-0.5 text-xs text-text-faint">
          {{
            heatmap.summary.totalLogs === 1
              ? $t('heatmap.entriesSingular', { count: 1 })
              : $t('heatmap.entriesPlural', { count: heatmap.summary.totalLogs })
          }}
        </div>
      </div>

      <div class="border border-border-hairline bg-bg-primary p-3.5">
        <div class="label-eyebrow flex items-center gap-1.5 text-text-muted">
          <Flame class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <span>{{ $t('heatmap.currentStreak') }}</span>
        </div>
        <div class="display-wide tabular-telemetry mt-1.5 text-lg sm:text-xl text-signal">
          {{ heatmap.summary.currentStreakDays }}
        </div>
        <div class="mt-0.5 text-xs text-text-faint">
          {{ $t('heatmap.daysUnit') }}
        </div>
      </div>

      <div class="border border-border-hairline bg-bg-primary p-3.5">
        <div class="label-eyebrow flex items-center gap-1.5 text-text-muted">
          <Trophy class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
          <span>{{ $t('heatmap.longestStreak') }}</span>
        </div>
        <div class="display-wide tabular-telemetry mt-1.5 text-lg sm:text-xl text-text-primary">
          {{ heatmap.summary.longestStreakDays }}
        </div>
        <div class="tabular-telemetry mt-0.5 text-xs text-text-faint">
          <template v-if="heatmap.summary.bestDay">
            {{ $t('heatmap.bestDayLabel') }}: {{ formatDuration(heatmap.summary.bestDay.totalSeconds) }}
          </template>
          <template v-else>
            {{ $t('heatmap.daysUnit') }}
          </template>
        </div>
      </div>
    </div>

    <!-- GitHub-Style Heatmap Matrix -->
    <div
      ref="gridRef"
      class="mt-6 overflow-x-auto pb-2"
      role="region"
      :aria-label="$t('heatmap.gridAria')"
      @scroll="hideTooltipImmediate"
    >
      <div class="inline-block min-w-max">
        <!-- Month Header Row -->
        <div class="relative mb-1.5 ml-10 h-4" :style="{ width: `${heatmap.weeks.length * 15}px` }">
          <span
            v-for="label in heatmap.monthLabels"
            :key="`${label.year}-${label.monthIndex}-${label.weekIndex}`"
            class="tabular-telemetry absolute top-0 text-xs font-medium text-text-muted whitespace-nowrap"
            :style="{ left: `${label.weekIndex * 15}px` }"
          >
            {{ formatMonthLabel(label.year, label.monthIndex) }}
          </span>
        </div>

        <!-- Weekday Labels + Week Columns -->
        <div class="flex items-start">
          <div class="mr-2 grid w-8 shrink-0 grid-rows-7 gap-[3px]">
            <span
              v-for="(label, idx) in weekdayRowLabels"
              :key="idx"
              class="flex h-3 items-center justify-end pr-0.5 text-xs font-medium uppercase text-text-faint select-none"
              aria-hidden="true"
            >
              {{ label }}
            </span>
          </div>

          <div class="flex gap-[3px]" role="grid" :aria-label="$t('heatmap.gridAria')">
            <div
              v-for="(week, weekIdx) in heatmap.weeks"
              :key="weekIdx"
              class="grid grid-rows-7 gap-[3px]"
              role="row"
            >
              <template v-for="(cell, dayIdx) in week" :key="cell.dateKey">
                <button
                  v-if="cell.inRange"
                  type="button"
                  role="gridcell"
                  :data-date-key="cell.dateKey"
                  :tabindex="rovingDateKey === cell.dateKey ? 0 : -1"
                  :aria-label="formatCellAriaLabel(cell)"
                  :aria-describedby="activeCell?.dateKey === cell.dateKey ? tooltipId : undefined"
                  class="h-3 w-3 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elevated"
                  :class="[
                    LEVEL_CLASSES[cell.level],
                    cell.isToday ? 'ring-1 ring-text-primary/70' : '',
                  ]"
                  @pointerenter="handleCellPointerEnter(cell, $event)"
                  @pointerleave="scheduleHideTooltip"
                  @focus="handleCellFocus(cell, $event)"
                  @blur="scheduleHideTooltip"
                  @click.stop="handleCellClick(cell, $event)"
                  @keydown="handleCellKeydown(weekIdx, dayIdx, cell, $event)"
                />
                <span
                  v-else
                  class="block h-3 w-3"
                  aria-hidden="true"
                />
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend & Timezone Footer -->
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline pt-3 text-xs text-text-muted">
      <div class="tabular-telemetry">
        {{ $t('heatmap.timezoneNote', { timeZone: prefsStore.preferences.timeZone }) }}
      </div>

      <div class="flex items-center gap-1.5" aria-hidden="true">
        <span>{{ $t('heatmap.less') }}</span>
        <span class="h-3 w-3 border" :class="LEVEL_CLASSES[0]" />
        <span class="h-3 w-3 border" :class="LEVEL_CLASSES[1]" />
        <span class="h-3 w-3 border" :class="LEVEL_CLASSES[2]" />
        <span class="h-3 w-3 border" :class="LEVEL_CLASSES[3]" />
        <span class="h-3 w-3 border" :class="LEVEL_CLASSES[4]" />
        <span>{{ $t('heatmap.more') }}</span>
      </div>
    </div>

    <!-- Shared Floating Tooltip (WCAG 1.4.13: hoverable, persistent, Esc-dismissible) -->
    <Teleport to="body">
      <div
        v-if="activeCell"
        :id="tooltipId"
        role="tooltip"
        class="fixed z-50 border border-border-hairline bg-bg-elevated px-3 py-2 text-xs shadow-2xl"
        :style="tooltipStyle"
        @pointerenter="isTooltipHovered = true; cancelHideTimer()"
        @pointerleave="isTooltipHovered = false; scheduleHideTooltip()"
      >
        <div class="font-medium text-text-primary">
          {{ formatDateKey(activeCell.dateKey) }}
        </div>
        <div v-if="activeCell.totalSeconds > 0" class="mt-0.5 flex items-center gap-2">
          <span class="tabular-telemetry font-semibold text-signal">
            {{ formatDuration(activeCell.totalSeconds) }}
          </span>
          <span class="tabular-telemetry text-text-muted">
            ({{
              activeCell.logCount === 1
                ? $t('heatmap.entriesSingular', { count: 1 })
                : $t('heatmap.entriesPlural', { count: activeCell.logCount })
            }})
          </span>
        </div>
        <div v-else class="mt-0.5 text-text-muted">
          {{ $t('heatmap.noTrackedTime') }}
        </div>
      </div>
    </Teleport>
  </UiInstrumentPanel>
</template>
