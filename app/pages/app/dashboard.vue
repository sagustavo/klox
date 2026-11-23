<script setup lang="ts">
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'vue-chartjs';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Layers,
  X,
} from 'lucide-vue-next';
import {
  DASHBOARD_TABLE_PAGE_SIZE,
  aggregatePizzaSlices,
  aggregateTimeSeriesStacked,
  extractDistinctDescriptionOptions,
  filterTimeLogs,
  formatTimeBucketLabel,
  groupLogsTwoLevel,
  paginateItems,
  resolveDateKeyBounds,
} from '~/domain/aggregation';
import { toDateKey } from '~/domain/duration';
import { publishDomainEvent } from '~/domain/events';
import { buildTagNameMap, resolveTagNames } from '~/domain/invariants';
import type {
  DashboardFilters,
  DateRangePreset,
  GroupByDimension,
  Project,
  SliceDimension,
  TimeGranularity,
  TimeLog,
} from '~/domain/types';
import type { FilterMultiSelectOption } from '~/components/ui/FilterMultiSelect.vue';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const timeLogsStore = useTimeLogsStore();
const { formatDateKey, formatDuration, formatDecimalHours } = useFormat(
  () => prefsStore.preferences
);

const presets: DateRangePreset[] = [
  'today',
  'this_week',
  'last_7_days',
  'this_month',
  'all_time',
  'custom',
];

const dimensions: SliceDimension[] = ['project', 'task', 'tag', 'description'];
const granularities: TimeGranularity[] = ['day', 'week', 'month', 'quarter', 'year'];
const pageSizeOptions = [25, 50, 100] as const;

const filters = reactive<DashboardFilters>({
  preset: 'this_week',
  customStartDate: '',
  customEndDate: '',
  projectIds: [],
  taskIds: [],
  tagIds: [],
  descriptions: [],
  searchQuery: '',
});

const isCustomStartValid = ref(true);
const isCustomEndValid = ref(true);

const pizzaDimension = ref<SliceDimension>('project');
const barDimension = ref<SliceDimension>('project');
const barGranularity = ref<TimeGranularity>('day');

const primaryGroup = ref<GroupByDimension>('project');
const secondaryGroup = ref<GroupByDimension>('tag');
const tablePageSize = ref<number>(DASHBOARD_TABLE_PAGE_SIZE);
const tablePageIndex = ref(0);
const expandedPrimaryGroups = ref<Set<string>>(new Set());
const expandedSubgroups = ref<Set<string>>(new Set());
const innerPageByNodeKey = ref<Record<string, number>>({});

onMounted(async () => {
  if (authStore.user) {
    await Promise.all([
      catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
      timeLogsStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    ]);
  }
  publishDomainEvent({
    type: 'DashboardViewed',
    at: new Date().toISOString(),
  });
});

function displayProjectName(project: Project | undefined, fallback?: string): string {
  if (project?.systemKey === 'unassigned') return t('catalog.unassigned');
  if (project) return project.name;
  return fallback || t('catalog.unassigned');
}

function displayProjectColor(log: TimeLog): string {
  return catalogStore.getProjectById(log.projectId)?.color ?? log.projectColorSnapshot;
}

function displayTaskLabel(log: TimeLog): string {
  if (!log.taskId) return '—';
  const live = catalogStore.getTaskById(log.taskId);
  return live
    ? catalogStore.getTaskHierarchicalLabel(live.id)
    : log.taskNameSnapshot || log.taskId;
}

function selectPreset(preset: DateRangePreset) {
  if (preset === 'custom') {
    const todayKey = toDateKey(new Date(), prefsStore.preferences.timeZone || 'UTC');
    if (!filters.customStartDate) {
      filters.customStartDate = currentBounds.value.startDateKey || todayKey;
    }
    if (!filters.customEndDate) {
      filters.customEndDate = currentBounds.value.endDateKey || todayKey;
    }
  }
  filters.preset = preset;
}

function clearAllFilters() {
  filters.preset = 'all_time';
  filters.customStartDate = '';
  filters.customEndDate = '';
  filters.projectIds = [];
  filters.taskIds = [];
  filters.tagIds = [];
  filters.descriptions = [];
  filters.searchQuery = '';
}

// FR-5.5: Dedicated Multi-Select Filter Options
const projectFilterOptions = computed<FilterMultiSelectOption[]>(() =>
  catalogStore.sortedProjects.map((proj) => ({
    value: proj.id,
    label: displayProjectName(proj),
    color: proj.color,
  }))
);

const taskFilterOptions = computed<FilterMultiSelectOption[]>(() => {
  const selectedProjects = new Set(filters.projectIds);
  const out: FilterMultiSelectOption[] = [];
  for (const proj of catalogStore.sortedProjects) {
    if (selectedProjects.size > 0 && !selectedProjects.has(proj.id)) continue;
    const projName = displayProjectName(proj);
    for (const node of catalogStore.getFlattenedTasksForProject(proj.id)) {
      out.push({
        value: node.task.id,
        label: node.hierarchicalLabel,
        secondaryLabel: projName,
        color: proj.color,
      });
    }
  }
  return out;
});

const tagFilterOptions = computed<FilterMultiSelectOption[]>(() => {
  const selectedProjects = new Set(filters.projectIds);
  const out: FilterMultiSelectOption[] = [];
  for (const proj of catalogStore.sortedProjects) {
    if (selectedProjects.size > 0 && !selectedProjects.has(proj.id)) continue;
    const projName = displayProjectName(proj);
    for (const tag of catalogStore.getTagsForProject(proj.id)) {
      out.push({
        value: tag.id,
        label: tag.name,
        secondaryLabel: projName,
        color: proj.color,
      });
    }
  }
  return out;
});

const descriptionFilterOptions = computed<FilterMultiSelectOption[]>(() =>
  extractDistinctDescriptionOptions(timeLogsStore.logs).map((opt) => ({
    value: opt.value,
    label: opt.label,
    secondaryLabel: `${opt.count}×`,
  }))
);

// Keep scoped Task and Tag selections consistent when Project filter narrows
watch(
  () => filters.projectIds,
  (nextProjectIds) => {
    if (nextProjectIds.length === 0) return;
    const allowedTasks = new Set(taskFilterOptions.value.map((o) => o.value));
    if (filters.taskIds.some((id) => !allowedTasks.has(id))) {
      filters.taskIds = filters.taskIds.filter((id) => allowedTasks.has(id));
    }
    const allowedTags = new Set(tagFilterOptions.value.map((o) => o.value));
    if (filters.tagIds.some((id) => !allowedTags.has(id))) {
      filters.tagIds = filters.tagIds.filter((id) => allowedTags.has(id));
    }
  }
);

const activeFiltersCount = computed(() => {
  let count = 0;
  if (filters.projectIds.length > 0) count += 1;
  if (filters.taskIds.length > 0) count += 1;
  if (filters.tagIds.length > 0) count += 1;
  if ((filters.descriptions?.length ?? 0) > 0) count += 1;
  if (filters.searchQuery.trim()) count += 1;
  return count;
});

const currentBounds = computed(() =>
  resolveDateKeyBounds({
    preset: filters.preset,
    customStartDate: isCustomStartValid.value ? filters.customStartDate : undefined,
    customEndDate: isCustomEndValid.value ? filters.customEndDate : undefined,
    timeZone: prefsStore.preferences.timeZone,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
  })
);

const filteredLogs = computed(() =>
  filterTimeLogs({
    logs: timeLogsStore.sortedLogs,
    filters: {
      ...filters,
      customStartDate: isCustomStartValid.value ? filters.customStartDate : undefined,
      customEndDate: isCustomEndValid.value ? filters.customEndDate : undefined,
    },
    timeZone: prefsStore.preferences.timeZone,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
  })
);

const catalogContext = computed(() => ({
  untaggedLabel: t('dashboard.untaggedBucket'),
  noTaskLabel: t('dashboard.noTaskBucket'),
  unassignedProjectLabel: t('catalog.unassigned'),
  projects: catalogStore.projects,
  tasks: catalogStore.tasks,
  tags: catalogStore.tags,
}));

const tagNameMap = computed(() => buildTagNameMap(catalogStore.tags));

// Visualization 1: 4-Dimension Pizza (Donut) Chart
const pizzaData = computed(() =>
  aggregatePizzaSlices({
    logs: filteredLogs.value,
    dimension: pizzaDimension.value,
    ...catalogContext.value,
  })
);

const doughnutChartData = computed(() => ({
  labels: pizzaData.value.slices.map((s) => s.label),
  datasets: [
    {
      data: pizzaData.value.slices.map((s) => Math.round((s.seconds / 3600) * 100) / 100),
      backgroundColor: pizzaData.value.slices.map((s) => s.color),
      borderColor: isDark.value ? '#0B0B0E' : '#FFFFFF',
      borderWidth: 2,
    },
  ],
}));

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '72%',
  plugins: {
    legend: { display: false },
  },
};

// Visualization 2: 4-Dimension Stacked Histogram with Day/Week/Month/Quarter/Year Granularity
const timeSeriesStacked = computed(() =>
  aggregateTimeSeriesStacked({
    logs: filteredLogs.value,
    dimension: barDimension.value,
    granularity: barGranularity.value,
    bounds: currentBounds.value,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
    timeZone: prefsStore.preferences.timeZone,
    ...catalogContext.value,
  })
);

const stackedBarChartData = computed(() => ({
  labels: timeSeriesStacked.value.bucketKeys.map((bk) =>
    formatTimeBucketLabel(bk, barGranularity.value, prefsStore.preferences.locale)
  ),
  datasets: timeSeriesStacked.value.series.map((s) => ({
    label: s.label,
    data: s.dataSeconds.map((sec) => Math.round((sec / 3600) * 100) / 100),
    backgroundColor: s.color,
    stack: 'telemetry',
  })),
}));

const stackedBarChartOptions = computed(() => {
  const gridColor = isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const tickColor = isDark.value ? '#9E9EA6' : '#48484F';
  const uiFont = 'Geist, Inter, ui-sans-serif, system-ui, sans-serif';
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { family: uiFont, size: 12 } },
      },
      y: {
        stacked: true,
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { family: uiFont, size: 12 } },
      },
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: tickColor, boxWidth: 12, font: { family: uiFont, size: 12 } },
      },
    },
  };
});

// Visualization 3: 2-Level Hierarchical Breakdown & Paginated Table
const secondaryDimensionOptions = computed(() => {
  if (primaryGroup.value === 'none') return [];
  return dimensions.filter((d) => d !== primaryGroup.value);
});

watch(primaryGroup, (nextPrimary) => {
  if (nextPrimary === 'none' || nextPrimary === secondaryGroup.value) {
    secondaryGroup.value = 'none';
  }
});

watch([primaryGroup, secondaryGroup], () => {
  expandedPrimaryGroups.value = new Set();
  expandedSubgroups.value = new Set();
});

const groupedBreakdown = computed(() => {
  if (primaryGroup.value === 'none') return [];
  return groupLogsTwoLevel({
    logs: filteredLogs.value,
    primaryDimension: primaryGroup.value,
    secondaryDimension: secondaryGroup.value,
    ...catalogContext.value,
  });
});

watch(
  [() => filteredLogs.value.length, primaryGroup, secondaryGroup, tablePageSize],
  () => {
    tablePageIndex.value = 0;
    innerPageByNodeKey.value = {};
  }
);

const paginatedFlatLogs = computed(() =>
  paginateItems({
    items: filteredLogs.value,
    pageIndex: tablePageIndex.value,
    pageSize: tablePageSize.value,
  })
);

const paginatedPrimaryGroups = computed(() =>
  paginateItems({
    items: groupedBreakdown.value,
    pageIndex: tablePageIndex.value,
    pageSize: tablePageSize.value,
  })
);

const activeTablePagination = computed(() =>
  primaryGroup.value === 'none'
    ? paginatedFlatLogs.value
    : paginatedPrimaryGroups.value
);

watch(
  () => activeTablePagination.value.pageIndex,
  (clamped) => {
    if (tablePageIndex.value !== clamped) {
      tablePageIndex.value = clamped;
    }
  }
);

function togglePrimaryGroup(key: string) {
  const next = new Set(expandedPrimaryGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedPrimaryGroups.value = next;
}

function toggleSubgroup(compositeKey: string) {
  const next = new Set(expandedSubgroups.value);
  if (next.has(compositeKey)) next.delete(compositeKey);
  else next.add(compositeKey);
  expandedSubgroups.value = next;
}

function expandAllGroups() {
  const nextPrimary = new Set<string>();
  const nextSub = new Set<string>();
  for (const grp of groupedBreakdown.value) {
    nextPrimary.add(grp.key);
    for (const sub of grp.subgroups) {
      nextSub.add(`${grp.key}::${sub.key}`);
    }
  }
  expandedPrimaryGroups.value = nextPrimary;
  expandedSubgroups.value = nextSub;
}

function collapseAllGroups() {
  expandedPrimaryGroups.value = new Set();
  expandedSubgroups.value = new Set();
}

function getInnerPageSlice(nodeKey: string, logs: readonly TimeLog[]) {
  return paginateItems({
    items: logs,
    pageIndex: innerPageByNodeKey.value[nodeKey] ?? 0,
    pageSize: DASHBOARD_TABLE_PAGE_SIZE,
  });
}

function setInnerPage(nodeKey: string, nextIndex: number) {
  innerPageByNodeKey.value = {
    ...innerPageByNodeKey.value,
    [nodeKey]: Math.max(0, nextIndex),
  };
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Title & Streaming Indicator -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
        {{ $t('nav.dashboard') }}
      </h1>

      <span
        v-if="timeLogsStore.streaming"
        data-testid="dashboard-streaming-badge"
        class="inline-flex items-center gap-2 border border-signal/40 bg-signal-soft px-3 py-1 text-xs font-medium text-signal"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-signal motion-safe:animate-pulse" />
        <span class="tabular-telemetry">
          {{ $t('timer.streamingHistory', { count: timeLogsStore.streamedCount }) }}
        </span>
      </span>
    </div>

    <!-- Global Reactive Filter Bar (FR-5.5) -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 space-y-4">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Time Range Segmented Presets -->
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="p in presets"
            :key="p"
            type="button"
            :data-testid="`dashboard-preset-${p}`"
            class="btn-press h-9 border px-3 text-ui font-medium transition-colors"
            :class="
              filters.preset === p
                ? 'border-accent bg-accent font-semibold text-white'
                : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
            "
            @click="selectPreset(p)"
          >
            {{ $t(`dashboard.presets.${p}`) }}
          </button>
        </div>

        <!-- Custom Start/End Date inputs when 'custom' is active -->
        <div
          v-if="filters.preset === 'custom'"
          class="flex flex-wrap items-center gap-2"
        >
          <div class="w-40">
            <UiDateInput
              v-model="filters.customStartDate!"
              v-model:valid="isCustomStartValid"
              calendar-placement="popover"
              size="sm"
              test-id="dashboard-custom-start"
            />
          </div>
          <span class="text-sm text-text-muted">→</span>
          <div class="w-40">
            <UiDateInput
              v-model="filters.customEndDate!"
              v-model:valid="isCustomEndValid"
              calendar-placement="popover"
              size="sm"
              test-id="dashboard-custom-end"
            />
          </div>
        </div>

        <!-- Clear All Filters Button -->
        <div class="flex items-center gap-2">
          <span
            v-if="activeFiltersCount > 0"
            class="tabular-telemetry border border-signal/40 bg-signal-soft px-2.5 py-1 text-xs font-medium text-signal"
          >
            {{ $t('dashboard.filters.activeCount', { count: activeFiltersCount }) }}
          </span>
          <button
            type="button"
            data-testid="dashboard-clear-filters"
            class="btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium uppercase text-text-muted hover:text-text-primary transition-colors"
            @click="clearAllFilters"
          >
            <X class="h-3.5 w-3.5" />
            <span>{{ $t('dashboard.clearFilters') }}</span>
          </button>
        </div>
      </div>

      <!-- 4 Dedicated Multi-Select Filter Dropdowns (Project, Task, Tag, Description) -->
      <div class="border-t border-border-hairline pt-4 space-y-2.5">
        <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
          <Filter class="h-3.5 w-3.5 text-signal" />
          <span>{{ $t('dashboard.filters.projectLabel') }} · {{ $t('dashboard.filters.taskLabel') }} · {{ $t('dashboard.filters.tagLabel') }} · {{ $t('dashboard.filters.descriptionLabel') }}</span>
        </div>

        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <UiFilterMultiSelect
            v-model="filters.projectIds"
            :options="projectFilterOptions"
            :label="$t('dashboard.filters.projectLabel')"
            :search-placeholder="$t('dashboard.filters.projectSearch')"
            :empty-text="$t('dashboard.filters.noProjects')"
            test-id="dashboard-filter-projects"
          />

          <UiFilterMultiSelect
            v-model="filters.taskIds"
            :options="taskFilterOptions"
            :label="$t('dashboard.filters.taskLabel')"
            :search-placeholder="$t('dashboard.filters.taskSearch')"
            :empty-text="$t('dashboard.filters.noTasks')"
            test-id="dashboard-filter-tasks"
          />

          <UiFilterMultiSelect
            v-model="filters.tagIds"
            :options="tagFilterOptions"
            :label="$t('dashboard.filters.tagLabel')"
            :search-placeholder="$t('dashboard.filters.tagSearch')"
            :empty-text="$t('dashboard.filters.noTags')"
            test-id="dashboard-filter-tags"
          />

          <UiFilterMultiSelect
            :model-value="filters.descriptions ?? []"
            :options="descriptionFilterOptions"
            :label="$t('dashboard.filters.descriptionLabel')"
            :search-placeholder="$t('dashboard.filters.descriptionSearch')"
            :empty-text="$t('dashboard.filters.noDescriptions')"
            test-id="dashboard-filter-descriptions"
            @update:model-value="filters.descriptions = $event"
          />
        </div>
      </div>
    </div>

    <!-- Visualizations 1 & 2 Grid -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Visualization 1: Pizza (Donut) Chart (4 Dimensions) -->
      <div class="relative overflow-hidden lg:col-span-5 border border-border-hairline bg-bg-elevated p-5 sm:p-6 flex flex-col">
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
          <span class="label-eyebrow text-signal">
            {{ $t('dashboard.pizzaTitle') }}
          </span>
          <div class="inline-flex flex-wrap border border-border-hairline bg-bg-primary text-xs font-medium">
            <button
              v-for="dim in dimensions"
              :key="dim"
              type="button"
              :data-testid="`dashboard-pizza-dim-${dim}`"
              class="btn-press px-2.5 py-1 transition-colors"
              :class="
                pizzaDimension === dim
                  ? 'bg-accent text-white font-semibold'
                  : 'text-text-muted hover:text-text-primary'
              "
              @click="pizzaDimension = dim"
            >
              {{ $t(`dashboard.dimensions.${dim}`) }}
            </button>
          </div>
        </div>

        <div class="relative mt-5 h-60 flex items-center justify-center">
          <ClientOnly>
            <Doughnut
              v-if="pizzaData.slices.length > 0"
              :data="doughnutChartData"
              :options="doughnutChartOptions"
            />
          </ClientOnly>
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="text-xs font-medium uppercase tracking-wider text-text-muted">
              {{ $t('dashboard.centerTotalLabel') }}
            </span>
            <span class="display-wide tabular-telemetry mt-1 text-base sm:text-lg text-text-primary">
              {{ formatDuration(pizzaData.totalTrackedSeconds) }}
            </span>
            <span class="tabular-telemetry text-ui font-medium text-signal">
              {{ formatDecimalHours(pizzaData.totalTrackedSeconds) }} h
            </span>
          </div>
        </div>

        <!-- Legend Breakdown -->
        <ul class="mt-5 divide-y divide-border-hairline text-ui max-h-52 overflow-y-auto">
          <li
            v-for="slice in pizzaData.slices"
            :key="slice.key"
            class="flex items-center justify-between py-2"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="h-2.5 w-2.5 shrink-0" :style="{ backgroundColor: slice.color }" />
              <span class="truncate text-text-primary">{{ slice.label }}</span>
            </div>
            <div class="tabular-telemetry flex items-center gap-3 shrink-0">
              <span class="text-text-muted">{{ slice.percentage }}%</span>
              <span class="text-text-primary font-medium">{{ formatDuration(slice.seconds) }}</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- Visualization 2: Stacked Histogram (4 Dimensions + 5 Time Granularities) -->
      <div class="relative overflow-hidden lg:col-span-7 border border-border-hairline bg-bg-elevated p-5 sm:p-6 flex flex-col">
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
          <span class="label-eyebrow text-signal">
            {{ $t('dashboard.dailyBarTitle') }}
          </span>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Temporal Granularity Selector -->
            <div
              role="group"
              :aria-label="$t('dashboard.granularityLabel')"
              class="inline-flex border border-border-hairline bg-bg-primary text-xs font-medium"
            >
              <button
                v-for="gran in granularities"
                :key="gran"
                type="button"
                :data-testid="`dashboard-bar-granularity-${gran}`"
                class="btn-press px-2.5 py-1 transition-colors"
                :class="
                  barGranularity === gran
                    ? 'bg-signal-soft text-signal font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                "
                @click="barGranularity = gran"
              >
                {{ $t(`dashboard.granularities.${gran}`) }}
              </button>
            </div>

            <!-- 4-Dimension Slicing Selector -->
            <div class="inline-flex flex-wrap border border-border-hairline bg-bg-primary text-xs font-medium">
              <button
                v-for="dim in dimensions"
                :key="dim"
                type="button"
                :data-testid="`dashboard-bar-dim-${dim}`"
                class="btn-press px-2.5 py-1 transition-colors"
                :class="
                  barDimension === dim
                    ? 'bg-accent text-white font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                "
                @click="barDimension = dim"
              >
                {{ $t(`dashboard.dimensions.${dim}`) }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 h-80">
          <ClientOnly>
            <Bar :data="stackedBarChartData" :options="stackedBarChartOptions" />
          </ClientOnly>
        </div>
      </div>
    </div>

    <!-- Visualization 3: 2-Level Hierarchical Breakdown & Paginated TimeLogs Table (FR-5.4) -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-3">
          <span class="label-eyebrow text-signal">
            {{ $t('dashboard.tableTitle') }} ({{ filteredLogs.length }})
          </span>
          <span
            v-if="primaryGroup === 'tag' || secondaryGroup === 'tag'"
            class="hidden md:inline text-ui text-text-muted"
          >
            {{ $t('dashboard.multiTagNote') }}
          </span>
        </div>

        <!-- Primary & Secondary Group Controls + Page Size -->
        <div class="flex flex-wrap items-center gap-2 text-ui">
          <label class="inline-flex items-center gap-1.5 text-text-muted">
            <Layers class="h-4 w-4 text-signal" />
            <span>{{ $t('dashboard.grouping.primaryLabel') }}:</span>
            <select
              v-model="primaryGroup"
              data-testid="dashboard-primary-group"
              class="h-9 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
            >
              <option value="none">{{ $t('dashboard.grouping.noneOption') }}</option>
              <option v-for="dim in dimensions" :key="dim" :value="dim">
                {{ $t(`dashboard.dimensions.${dim}`) }}
              </option>
            </select>
          </label>

          <label
            v-if="primaryGroup !== 'none'"
            class="inline-flex items-center gap-1.5 text-text-muted"
          >
            <span>{{ $t('dashboard.grouping.secondaryLabel') }}:</span>
            <select
              v-model="secondaryGroup"
              data-testid="dashboard-secondary-group"
              class="h-9 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
            >
              <option value="none">{{ $t('dashboard.grouping.noneOption') }}</option>
              <option
                v-for="dim in secondaryDimensionOptions"
                :key="dim"
                :value="dim"
              >
                {{ $t(`dashboard.dimensions.${dim}`) }}
              </option>
            </select>
          </label>

          <div
            v-if="primaryGroup !== 'none' && groupedBreakdown.length > 0"
            class="inline-flex border border-border-hairline bg-bg-primary"
          >
            <button
              type="button"
              class="h-9 px-2.5 text-xs text-text-muted hover:text-text-primary border-r border-border-hairline transition-colors"
              @click="expandAllGroups"
            >
              {{ $t('dashboard.grouping.expandAll') }}
            </button>
            <button
              type="button"
              class="h-9 px-2.5 text-xs text-text-muted hover:text-text-primary transition-colors"
              @click="collapseAllGroups"
            >
              {{ $t('dashboard.grouping.collapseAll') }}
            </button>
          </div>

          <label class="inline-flex items-center gap-1.5 text-text-muted">
            <span>{{ $t('dashboard.pagination.rowsPerPage') }}:</span>
            <select
              v-model.number="tablePageSize"
              data-testid="dashboard-table-page-size"
              class="tabular-telemetry h-9 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
            >
              <option v-for="sz in pageSizeOptions" :key="sz" :value="sz">
                {{ sz }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div
        v-if="filteredLogs.length === 0"
        class="p-8 text-center text-sm text-text-muted"
      >
        {{ $t('dashboard.emptyFiltered') }}
      </div>

      <!-- 1-Level / 2-Level Hierarchical Grouped Breakdown -->
      <div
        v-else-if="primaryGroup !== 'none'"
        data-testid="dashboard-grouped-table"
        class="divide-y divide-border-hairline"
      >
        <div
          v-for="grp in paginatedPrimaryGroups.items"
          :key="grp.key"
          data-testid="dashboard-primary-group-row"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between bg-bg-primary/60 px-4 py-3 text-left text-ui hover:bg-bg-hover transition-colors"
            @click="togglePrimaryGroup(grp.key)"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <ChevronDown
                class="h-4 w-4 shrink-0 text-signal motion-safe:transition-transform motion-safe:duration-200"
                :class="expandedPrimaryGroups.has(grp.key) ? 'rotate-0' : '-rotate-90'"
              />
              <span
                v-if="grp.color"
                class="h-2.5 w-2.5 shrink-0"
                :style="{ backgroundColor: grp.color }"
              />
              <span class="truncate font-semibold text-text-primary">{{ grp.label }}</span>
              <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs text-text-muted">
                {{ grp.count }}
              </span>
            </div>
            <span class="tabular-telemetry shrink-0 text-sm font-semibold text-text-primary">
              {{ formatDuration(grp.subtotalSeconds) }}
            </span>
          </button>

          <div v-if="expandedPrimaryGroups.has(grp.key)">
            <!-- 2-Level Secondary Subgroups -->
            <div
              v-if="secondaryGroup !== 'none'"
              class="divide-y divide-border-hairline border-t border-border-hairline"
            >
              <div
                v-for="sub in grp.subgroups"
                :key="`${grp.key}::${sub.key}`"
                data-testid="dashboard-secondary-group-row"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between bg-bg-elevated pl-8 pr-4 py-2.5 text-left text-ui hover:bg-bg-hover/60 transition-colors"
                  @click="toggleSubgroup(`${grp.key}::${sub.key}`)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <ChevronDown
                      class="h-3.5 w-3.5 shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200"
                      :class="expandedSubgroups.has(`${grp.key}::${sub.key}`) ? 'rotate-0' : '-rotate-90'"
                    />
                    <span
                      v-if="sub.color"
                      class="h-2.5 w-2.5 shrink-0"
                      :style="{ backgroundColor: sub.color }"
                    />
                    <span class="truncate font-medium text-text-primary">{{ sub.label }}</span>
                    <span class="tabular-telemetry border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted">
                      {{ sub.count }}
                    </span>
                  </div>
                  <span class="tabular-telemetry shrink-0 text-sm text-text-primary font-medium">
                    {{ formatDuration(sub.subtotalSeconds) }}
                  </span>
                </button>

                <div
                  v-if="expandedSubgroups.has(`${grp.key}::${sub.key}`)"
                  class="overflow-x-auto border-t border-border-hairline/70 bg-bg-primary/25"
                >
                  <table class="w-full text-left text-sm">
                    <tbody class="divide-y divide-border-hairline">
                      <tr
                        v-for="log in getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).items"
                        :key="`${grp.key}-${sub.key}-${log.id}`"
                        class="hover:bg-bg-hover/40"
                      >
                        <td class="tabular-telemetry whitespace-nowrap pl-12 pr-4 py-2.5 text-ui text-text-muted">
                          {{ formatDateKey(log.dateKey) }}
                        </td>
                        <td class="px-4 py-2.5 font-medium text-text-primary">
                          {{ log.description }}
                        </td>
                        <td class="whitespace-nowrap px-4 py-2.5 text-ui">
                          <span class="inline-flex items-center gap-1.5">
                            <span
                              class="h-2.5 w-2.5"
                              :style="{ backgroundColor: displayProjectColor(log) }"
                            />
                            <span>
                              {{
                                displayProjectName(
                                  catalogStore.getProjectById(log.projectId),
                                  log.projectNameSnapshot
                                )
                              }}
                            </span>
                          </span>
                        </td>
                        <td class="whitespace-nowrap px-4 py-2.5 text-ui text-text-muted">
                          {{ displayTaskLabel(log) }}
                        </td>
                        <td class="px-4 py-2.5 text-xs text-text-muted">
                          <span
                            v-for="(tn, idx) in resolveTagNames(log.tagIds, tagNameMap)"
                            :key="idx"
                            class="mr-1.5 inline-flex border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted"
                          >
                            {{ tn }}
                          </span>
                        </td>
                        <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 text-right font-semibold text-text-primary">
                          {{ formatDuration(log.durationSeconds) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <!-- Compact Inner Pagination for large Subgroup -->
                  <div
                    v-if="getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).totalPages > 1"
                    class="flex items-center justify-between border-t border-border-hairline bg-bg-primary/50 pl-12 pr-4 py-2 text-xs text-text-muted"
                  >
                    <span class="tabular-telemetry">
                      {{
                        $t('dashboard.pagination.showingRange', {
                          start: getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).startItem,
                          end: getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).endItem,
                          total: getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).totalItems,
                        })
                      }}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        :disabled="!getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).hasPreviousPage"
                        class="btn-press h-7 border border-border-hairline bg-bg-elevated px-2.5 text-text-primary disabled:opacity-35"
                        @click="setInnerPage(`${grp.key}::${sub.key}`, getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).pageIndex - 1)"
                      >
                        {{ $t('dashboard.pagination.previous') }}
                      </button>
                      <span class="tabular-telemetry px-1.5">
                        {{
                          $t('dashboard.pagination.pageOf', {
                            page: getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).pageNumber,
                            total: getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).totalPages,
                          })
                        }}
                      </span>
                      <button
                        type="button"
                        :disabled="!getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).hasNextPage"
                        class="btn-press h-7 border border-border-hairline bg-bg-elevated px-2.5 text-text-primary disabled:opacity-35"
                        @click="setInnerPage(`${grp.key}::${sub.key}`, getInnerPageSlice(`${grp.key}::${sub.key}`, sub.logs).pageIndex + 1)"
                      >
                        {{ $t('dashboard.pagination.next') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 1-Level Group Inner Rows (Secondary = None) -->
            <div v-else class="overflow-x-auto border-t border-border-hairline">
              <table class="w-full text-left text-sm">
                <tbody class="divide-y divide-border-hairline">
                  <tr
                    v-for="log in getInnerPageSlice(grp.key, grp.logs).items"
                    :key="`${grp.key}-${log.id}`"
                    class="hover:bg-bg-hover/40"
                  >
                    <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 text-ui text-text-muted">
                      {{ formatDateKey(log.dateKey) }}
                    </td>
                    <td class="px-4 py-2.5 font-medium text-text-primary">
                      {{ log.description }}
                    </td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-ui">
                      <span class="inline-flex items-center gap-1.5">
                        <span
                          class="h-2.5 w-2.5"
                          :style="{ backgroundColor: displayProjectColor(log) }"
                        />
                        <span>
                          {{
                            displayProjectName(
                              catalogStore.getProjectById(log.projectId),
                              log.projectNameSnapshot
                            )
                          }}
                        </span>
                      </span>
                    </td>
                    <td class="whitespace-nowrap px-4 py-2.5 text-ui text-text-muted">
                      {{ displayTaskLabel(log) }}
                    </td>
                    <td class="px-4 py-2.5 text-xs text-text-muted">
                      <span
                        v-for="(tn, idx) in resolveTagNames(log.tagIds, tagNameMap)"
                        :key="idx"
                        class="mr-1.5 inline-flex border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted"
                      >
                        {{ tn }}
                      </span>
                    </td>
                    <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 text-right font-semibold text-text-primary">
                      {{ formatDuration(log.durationSeconds) }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="getInnerPageSlice(grp.key, grp.logs).totalPages > 1"
                class="flex items-center justify-between border-t border-border-hairline bg-bg-primary/50 px-4 py-2 text-xs text-text-muted"
              >
                <span class="tabular-telemetry">
                  {{
                    $t('dashboard.pagination.showingRange', {
                      start: getInnerPageSlice(grp.key, grp.logs).startItem,
                      end: getInnerPageSlice(grp.key, grp.logs).endItem,
                      total: getInnerPageSlice(grp.key, grp.logs).totalItems,
                    })
                  }}
                </span>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    :disabled="!getInnerPageSlice(grp.key, grp.logs).hasPreviousPage"
                    class="btn-press h-7 border border-border-hairline bg-bg-elevated px-2.5 text-text-primary disabled:opacity-35"
                    @click="setInnerPage(grp.key, getInnerPageSlice(grp.key, grp.logs).pageIndex - 1)"
                  >
                    {{ $t('dashboard.pagination.previous') }}
                  </button>
                  <span class="tabular-telemetry px-1.5">
                    {{
                      $t('dashboard.pagination.pageOf', {
                        page: getInnerPageSlice(grp.key, grp.logs).pageNumber,
                        total: getInnerPageSlice(grp.key, grp.logs).totalPages,
                      })
                    }}
                  </span>
                  <button
                    type="button"
                    :disabled="!getInnerPageSlice(grp.key, grp.logs).hasNextPage"
                    class="btn-press h-7 border border-border-hairline bg-bg-elevated px-2.5 text-text-primary disabled:opacity-35"
                    @click="setInnerPage(grp.key, getInnerPageSlice(grp.key, grp.logs).pageIndex + 1)"
                  >
                    {{ $t('dashboard.pagination.next') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Flat Table Mode (Paginated) -->
      <div v-else class="overflow-x-auto" data-testid="dashboard-flat-table">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border-hairline bg-bg-primary/60 text-xs font-medium uppercase tracking-wider text-text-muted">
            <tr>
              <th class="px-4 py-2.5">{{ $t('dashboard.colDate') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colDescription') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colProject') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colTask') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colTags') }}</th>
              <th class="px-4 py-2.5 text-right">{{ $t('dashboard.colDuration') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-hairline">
            <tr
              v-for="log in paginatedFlatLogs.items"
              :key="log.id"
              data-testid="dashboard-flat-row"
              class="hover:bg-bg-hover/40"
            >
              <td class="tabular-telemetry whitespace-nowrap px-4 py-3 text-ui text-text-muted">
                {{ formatDateKey(log.dateKey) }}
              </td>
              <td class="px-4 py-3 font-medium text-text-primary">
                {{ log.description }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-ui">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2.5 w-2.5" :style="{ backgroundColor: displayProjectColor(log) }" />
                  <span>
                    {{
                      displayProjectName(
                        catalogStore.getProjectById(log.projectId),
                        log.projectNameSnapshot
                      )
                    }}
                  </span>
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-ui text-text-muted">
                {{ displayTaskLabel(log) }}
              </td>
              <td class="px-4 py-3 text-xs text-text-muted">
                <span
                  v-for="(tn, idx) in resolveTagNames(log.tagIds, tagNameMap)"
                  :key="idx"
                  class="mr-1.5 inline-flex border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted"
                >
                  {{ tn }}
                </span>
              </td>
              <td class="tabular-telemetry whitespace-nowrap px-4 py-3 text-right font-semibold text-text-primary">
                {{ formatDuration(log.durationSeconds) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table Pagination Footer -->
      <div
        v-if="filteredLogs.length > 0 && activeTablePagination.totalItems > 0"
        data-testid="dashboard-table-pagination"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline bg-bg-primary/50 px-4 py-3 text-ui"
      >
        <span class="tabular-telemetry text-text-muted">
          {{
            $t('dashboard.pagination.showingRange', {
              start: activeTablePagination.startItem,
              end: activeTablePagination.endItem,
              total: activeTablePagination.totalItems,
            })
          }}
        </span>

        <div v-if="activeTablePagination.totalPages > 1" class="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="dashboard-pagination-first"
            :disabled="!activeTablePagination.hasPreviousPage"
            :aria-label="$t('dashboard.pagination.first')"
            class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover disabled:opacity-35"
            @click="tablePageIndex = 0"
          >
            <ChevronsLeft class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="dashboard-pagination-prev"
            :disabled="!activeTablePagination.hasPreviousPage"
            class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-35"
            @click="tablePageIndex = Math.max(0, activeTablePagination.pageIndex - 1)"
          >
            <ChevronLeft class="h-4 w-4" />
            <span>{{ $t('dashboard.pagination.previous') }}</span>
          </button>
          <span
            data-testid="dashboard-pagination-page"
            class="tabular-telemetry inline-flex h-8 items-center border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-muted"
          >
            {{
              $t('dashboard.pagination.pageOf', {
                page: activeTablePagination.pageNumber,
                total: activeTablePagination.totalPages,
              })
            }}
          </span>
          <button
            type="button"
            data-testid="dashboard-pagination-next"
            :disabled="!activeTablePagination.hasNextPage"
            class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-35"
            @click="tablePageIndex = activeTablePagination.pageIndex + 1"
          >
            <span>{{ $t('dashboard.pagination.next') }}</span>
            <ChevronRight class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="dashboard-pagination-last"
            :disabled="!activeTablePagination.hasNextPage"
            :aria-label="$t('dashboard.pagination.last')"
            class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover disabled:opacity-35"
            @click="tablePageIndex = activeTablePagination.totalPages - 1"
          >
            <ChevronsRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
