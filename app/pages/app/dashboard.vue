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
import { ChevronDown, ChevronRight, Filter, Layers } from 'lucide-vue-next';
import {
  aggregateDailyStacked,
  aggregatePizzaSlices,
  filterTimeLogs,
  groupLogsByTag,
  resolveDateKeyBounds,
} from '~/domain/aggregation';
import { publishDomainEvent } from '~/domain/events';
import { buildTagNameMap, resolveTagNames } from '~/domain/invariants';
import type {
  DashboardFilters,
  DateRangePreset,
  EntityId,
  Project,
  SliceDimension,
} from '~/domain/types';
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
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const timeLogsStore = useTimeLogsStore();
const { formatDateKey, formatDuration, formatDecimalHours } = useFormat(() => prefsStore.preferences);

const presets: DateRangePreset[] = [
  'today',
  'this_week',
  'last_7_days',
  'this_month',
  'all_time',
  'custom',
];

const dimensions: SliceDimension[] = ['tag', 'project', 'description'];

const filters = reactive<DashboardFilters>({
  preset: 'this_week',
  customStartDate: '',
  customEndDate: '',
  projectIds: [],
  taskIds: [],
  tagIds: [],
  searchQuery: '',
});

const pizzaDimension = ref<SliceDimension>('project');
const barDimension = ref<SliceDimension>('project');
const groupByTag = ref(true);
const collapsedTagGroups = ref<Set<string>>(new Set());

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

function toggleProjectFilter(id: EntityId) {
  const idx = filters.projectIds.indexOf(id);
  if (idx >= 0) filters.projectIds.splice(idx, 1);
  else filters.projectIds.push(id);
}

function toggleTagFilter(id: EntityId) {
  const idx = filters.tagIds.indexOf(id);
  if (idx >= 0) filters.tagIds.splice(idx, 1);
  else filters.tagIds.push(id);
}

function clearAllFilters() {
  filters.preset = 'all_time';
  filters.customStartDate = '';
  filters.customEndDate = '';
  filters.projectIds = [];
  filters.taskIds = [];
  filters.tagIds = [];
  filters.searchQuery = '';
}

const currentBounds = computed(() =>
  resolveDateKeyBounds({
    preset: filters.preset,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
    timeZone: prefsStore.preferences.timeZone,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
  })
);

const filteredLogs = computed(() =>
  filterTimeLogs({
    logs: timeLogsStore.sortedLogs,
    filters,
    timeZone: prefsStore.preferences.timeZone,
    weekStartsOn: prefsStore.preferences.weekStartsOn,
  })
);

const pizzaData = computed(() =>
  aggregatePizzaSlices({
    logs: filteredLogs.value,
    dimension: pizzaDimension.value,
    untaggedLabel: t('dashboard.untaggedBucket'),
    tags: catalogStore.tags,
  })
);

const doughnutChartData = computed(() => ({
  labels: pizzaData.value.slices.map((s) => s.label),
  datasets: [
    {
      data: pizzaData.value.slices.map((s) => Math.round((s.seconds / 3600) * 100) / 100),
      backgroundColor: pizzaData.value.slices.map((s) => s.color),
      borderColor: '#0C0C0E',
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

const dailyStacked = computed(() =>
  aggregateDailyStacked({
    logs: filteredLogs.value,
    dimension: barDimension.value,
    bounds: currentBounds.value,
    untaggedLabel: t('dashboard.untaggedBucket'),
    tags: catalogStore.tags,
  })
);

const stackedBarChartData = computed(() => ({
  labels: dailyStacked.value.dateKeys.map((dk) => dk.slice(5)), // MM-DD
  datasets: dailyStacked.value.series.map((s) => ({
    label: s.label,
    data: s.dataSeconds.map((sec) => Math.round((sec / 3600) * 100) / 100),
    backgroundColor: s.color,
    stack: 'daily',
  })),
}));

const stackedBarChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      stacked: true,
      grid: { color: 'rgba(142, 142, 147, 0.12)' },
      ticks: { color: '#8E8E93', font: { family: 'JetBrains Mono', size: 10 } },
    },
    y: {
      stacked: true,
      grid: { color: 'rgba(142, 142, 147, 0.12)' },
      ticks: { color: '#8E8E93', font: { family: 'JetBrains Mono', size: 10 } },
    },
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { color: '#8E8E93', boxWidth: 10, font: { family: 'JetBrains Mono', size: 11 } },
    },
  },
};

const tagNameMap = computed(() => buildTagNameMap(catalogStore.tags));

const tagGroups = computed(() =>
  groupLogsByTag(filteredLogs.value, t('dashboard.untaggedBucket'), catalogStore.tags)
);

function toggleTagGroupCollapse(key: string) {
  const next = new Set(collapsedTagGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedTagGroups.value = next;
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="border border-border-hairline bg-bg-elevated p-5">
      <h1 class="text-lg font-semibold text-text-primary">
        {{ $t('dashboard.title') }}
      </h1>
      <p class="mt-1 text-xs text-text-muted">
        {{ $t('dashboard.subtitle') }}
      </p>
    </div>

    <!-- Global Reactive Filter Bar -->
    <div class="border border-border-hairline bg-bg-elevated p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Time Range Segmented Presets -->
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="p in presets"
            :key="p"
            type="button"
            class="border px-2.5 py-1 text-xs font-mono transition-colors"
            :class="
              filters.preset === p
                ? 'border-accent bg-accent text-white'
                : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
            "
            @click="filters.preset = p"
          >
            {{ $t(`dashboard.presets.${p}`) }}
          </button>
        </div>

        <!-- Custom Start/End Date inputs when 'custom' is active -->
        <div v-if="filters.preset === 'custom'" class="flex items-center gap-2">
          <input
            v-model="filters.customStartDate"
            type="date"
            class="tabular-telemetry h-8 border border-border-hairline bg-bg-primary px-2 text-xs font-mono text-text-primary"
          />
          <span class="text-xs text-text-muted">→</span>
          <input
            v-model="filters.customEndDate"
            type="date"
            class="tabular-telemetry h-8 border border-border-hairline bg-bg-primary px-2 text-xs font-mono text-text-primary"
          />
        </div>

        <!-- Description Search + Clear -->
        <div class="flex items-center gap-2 flex-1 sm:max-w-xs">
          <input
            v-model="filters.searchQuery"
            type="text"
            :placeholder="$t('dashboard.searchPlaceholder')"
            class="h-8 w-full border border-border-hairline bg-bg-primary px-3 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            class="h-8 border border-border-hairline bg-bg-primary px-2.5 text-[11px] font-mono uppercase text-text-muted hover:text-text-primary"
            @click="clearAllFilters"
          >
            {{ $t('dashboard.clearFilters') }}
          </button>
        </div>
      </div>

      <!-- Multi-Select Project & Tag Chips -->
      <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-border-hairline text-xs">
        <span class="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-text-muted">
          <Filter class="h-3 w-3 text-accent" />
          <span>{{ $t('dashboard.projectsFilter') }}:</span>
        </span>
        <button
          v-for="proj in catalogStore.sortedProjects"
          :key="proj.id"
          type="button"
          class="inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs transition-colors"
          :class="
            filters.projectIds.includes(proj.id)
              ? 'border-accent bg-accent/15 text-text-primary'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="toggleProjectFilter(proj.id)"
        >
          <span class="h-2 w-2" :style="{ backgroundColor: proj.color }" />
          <span>{{ displayProjectName(proj) }}</span>
        </button>

        <template v-if="catalogStore.tags.length > 0">
          <span class="ml-3 font-mono text-[11px] uppercase text-text-muted">
            {{ $t('dashboard.tagsFilter') }}:
          </span>
          <button
            v-for="tag in catalogStore.tags"
            :key="tag.id"
            type="button"
            class="border px-2 py-0.5 text-[11px] font-mono transition-colors"
            :class="
              filters.tagIds.includes(tag.id)
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
            "
            @click="toggleTagFilter(tag.id)"
          >
            #{{ tag.name }}
          </button>
        </template>
      </div>
    </div>

    <!-- Visualizations 1 & 2 Grid -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Visualization 1: Pizza (Donut) Chart -->
      <div class="lg:col-span-5 border border-border-hairline bg-bg-elevated p-5 flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
          <span class="text-xs font-mono uppercase tracking-wider text-accent">
            {{ $t('dashboard.pizzaTitle') }}
          </span>
          <div class="inline-flex border border-border-hairline bg-bg-primary text-[11px] font-mono">
            <button
              v-for="dim in dimensions"
              :key="dim"
              type="button"
              class="px-2 py-0.5 transition-colors"
              :class="
                pizzaDimension === dim
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-primary'
              "
              @click="pizzaDimension = dim"
            >
              {{ $t(`dashboard.dimensions.${dim}`) }}
            </button>
          </div>
        </div>

        <div class="relative mt-5 h-56 flex items-center justify-center">
          <ClientOnly>
            <Doughnut
              v-if="pizzaData.slices.length > 0"
              :data="doughnutChartData"
              :options="doughnutChartOptions"
            />
          </ClientOnly>
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              {{ $t('dashboard.centerTotalLabel') }}
            </span>
            <span class="tabular-telemetry mt-0.5 font-mono text-lg font-semibold text-text-primary">
              {{ formatDuration(pizzaData.totalTrackedSeconds) }}
            </span>
            <span class="tabular-telemetry text-[11px] font-mono text-accent">
              {{ formatDecimalHours(pizzaData.totalTrackedSeconds) }} h
            </span>
          </div>
        </div>

        <!-- Legend Breakdown -->
        <ul class="mt-5 divide-y divide-border-hairline text-xs max-h-48 overflow-y-auto">
          <li
            v-for="slice in pizzaData.slices"
            :key="slice.key"
            class="flex items-center justify-between py-1.5"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="h-2.5 w-2.5 shrink-0" :style="{ backgroundColor: slice.color }" />
              <span class="truncate text-text-primary">{{ slice.label }}</span>
            </div>
            <div class="tabular-telemetry flex items-center gap-3 shrink-0 font-mono">
              <span class="text-text-muted">{{ slice.percentage }}%</span>
              <span class="text-text-primary font-medium">{{ formatDuration(slice.seconds) }}</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- Visualization 2: Duration by Day Graph (Stacked Bar Chart) -->
      <div class="lg:col-span-7 border border-border-hairline bg-bg-elevated p-5 flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
          <span class="text-xs font-mono uppercase tracking-wider text-accent">
            {{ $t('dashboard.dailyBarTitle') }}
          </span>
          <div class="inline-flex border border-border-hairline bg-bg-primary text-[11px] font-mono">
            <button
              v-for="dim in dimensions"
              :key="dim"
              type="button"
              class="px-2 py-0.5 transition-colors"
              :class="
                barDimension === dim
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-primary'
              "
              @click="barDimension = dim"
            >
              {{ $t(`dashboard.dimensions.${dim}`) }}
            </button>
          </div>
        </div>

        <div class="mt-5 h-80">
          <ClientOnly>
            <Bar :data="stackedBarChartData" :options="stackedBarChartOptions" />
          </ClientOnly>
        </div>
      </div>
    </div>

    <!-- Visualization 3: Filtered Tasks / TimeLogs Data Table (Groupable by Tag) -->
    <div class="border border-border-hairline bg-bg-elevated">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline p-4">
        <div class="flex items-center gap-3">
          <span class="text-xs font-mono uppercase tracking-wider text-accent">
            {{ $t('dashboard.tableTitle') }} ({{ filteredLogs.length }})
          </span>
          <span v-if="groupByTag" class="hidden sm:inline text-[11px] text-text-muted">
            {{ $t('dashboard.multiTagNote') }}
          </span>
        </div>

        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 border px-3 text-xs font-mono transition-colors"
          :class="
            groupByTag
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="groupByTag = !groupByTag"
        >
          <Layers class="h-3.5 w-3.5" />
          <span>{{ $t('dashboard.groupByTagToggle') }}</span>
        </button>
      </div>

      <div
        v-if="filteredLogs.length === 0"
        class="p-8 text-center text-xs font-mono text-text-muted"
      >
        {{ $t('dashboard.emptyFiltered') }}
      </div>

      <!-- Grouped by Tag Breakdown Mode -->
      <div v-else-if="groupByTag" class="divide-y divide-border-hairline">
        <div v-for="grp in tagGroups" :key="grp.tagKey">
          <button
            type="button"
            class="flex w-full items-center justify-between bg-bg-primary/60 px-4 py-2.5 text-left text-xs font-mono hover:bg-bg-hover transition-colors"
            @click="toggleTagGroupCollapse(grp.tagKey)"
          >
            <div class="flex items-center gap-2">
              <ChevronRight
                v-if="collapsedTagGroups.has(grp.tagKey)"
                class="h-3.5 w-3.5 text-accent"
              />
              <ChevronDown v-else class="h-3.5 w-3.5 text-accent" />
              <span class="font-semibold text-text-primary">{{ grp.tagLabel }}</span>
              <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                {{ grp.count }}
              </span>
            </div>
            <span class="tabular-telemetry font-semibold text-text-primary">
              {{ formatDuration(grp.subtotalSeconds) }}
            </span>
          </button>

          <div v-if="!collapsedTagGroups.has(grp.tagKey)" class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <tbody class="divide-y divide-border-hairline">
                <tr
                  v-for="log in grp.logs"
                  :key="`${grp.tagKey}-${log.id}`"
                  class="hover:bg-bg-hover/40"
                >
                  <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 font-mono text-text-muted">
                    {{ formatDateKey(log.dateKey) }}
                  </td>
                  <td class="px-4 py-2.5 font-medium text-text-primary">
                    {{ log.description }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-2.5">
                    <span class="inline-flex items-center gap-1.5">
                      <span class="h-2 w-2" :style="{ backgroundColor: log.projectColorSnapshot }" />
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
                  <td class="px-4 py-2.5 font-mono text-[11px] text-text-muted">
                    <span
                      v-for="(tn, idx) in resolveTagNames(log.tagIds, tagNameMap)"
                      :key="idx"
                      class="mr-1.5"
                    >
                      #{{ tn }}
                    </span>
                  </td>
                  <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 text-right font-mono font-semibold text-text-primary">
                    {{ formatDuration(log.durationSeconds) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Flat Table Mode -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-border-hairline bg-bg-primary/60 font-mono text-[11px] uppercase text-text-muted">
            <tr>
              <th class="px-4 py-2">{{ $t('dashboard.colDate') }}</th>
              <th class="px-4 py-2">{{ $t('dashboard.colDescription') }}</th>
              <th class="px-4 py-2">{{ $t('dashboard.colProject') }}</th>
              <th class="px-4 py-2">{{ $t('dashboard.colTags') }}</th>
              <th class="px-4 py-2 text-right">{{ $t('dashboard.colDuration') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-hairline">
            <tr
              v-for="log in filteredLogs"
              :key="log.id"
              class="hover:bg-bg-hover/40"
            >
              <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 font-mono text-text-muted">
                {{ formatDateKey(log.dateKey) }}
              </td>
              <td class="px-4 py-2.5 font-medium text-text-primary">
                {{ log.description }}
              </td>
              <td class="whitespace-nowrap px-4 py-2.5">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2" :style="{ backgroundColor: log.projectColorSnapshot }" />
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
              <td class="px-4 py-2.5 font-mono text-[11px] text-text-muted">
                <span v-for="(tn, idx) in resolveTagNames(log.tagIds, tagNameMap)" :key="idx" class="mr-1.5">
                  #{{ tn }}
                </span>
              </td>
              <td class="tabular-telemetry whitespace-nowrap px-4 py-2.5 text-right font-mono font-semibold text-text-primary">
                {{ formatDuration(log.durationSeconds) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
