<script setup lang="ts">
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  X,
} from 'lucide-vue-next';
import { paginateItems } from '~/domain/aggregation';
import { formatHMS } from '~/domain/duration';
import {
  createEmptyTogglPreviewFilters,
  extractTogglPreviewFilterOptions,
  filterTogglPreviewRows,
  hasActiveTogglPreviewFilters,
  type ParsedTogglLogRow,
  type TogglPreviewColumnFilters,
  type TogglRowImportStatus,
} from '~/domain/toggl';

const props = withDefaults(
  defineProps<{
    rows: readonly ParsedTogglLogRow[];
    statusFilter?: 'all' | TogglRowImportStatus;
  }>(),
  {
    statusFilter: 'all',
  }
);

const emit = defineEmits<{
  'update:statusFilter': [value: 'all' | TogglRowImportStatus];
}>();

const { t } = useI18n();

const filters = reactive<TogglPreviewColumnFilters>(createEmptyTogglPreviewFilters());
const pageSizeOptions = [25, 50, 100, 250] as const;
const pageSize = ref<number>(50);
const pageIndex = ref(0);

function deriveStatusFilter(statuses: readonly TogglRowImportStatus[]): 'all' | TogglRowImportStatus {
  return statuses.length === 1 ? statuses[0]! : 'all';
}

watch(
  () => props.statusFilter,
  (next) => {
    if (deriveStatusFilter(filters.statuses) !== next) {
      filters.statuses = next === 'all' ? [] : [next];
    }
  },
  { immediate: true }
);

watch(
  () => filters.statuses,
  (next) => {
    const derived = deriveStatusFilter(next);
    if (derived !== props.statusFilter) {
      emit('update:statusFilter', derived);
    }
  }
);

const filterOptions = computed(() =>
  extractTogglPreviewFilterOptions(props.rows, {
    pending: t('csv.table.statusPending'),
    imported: t('csv.table.statusImported'),
    unassigned: t('catalog.unassigned'),
    untagged: t('csv.table.untagged'),
  })
);

const filteredRows = computed(() => filterTogglPreviewRows(props.rows, filters));

const paginated = computed(() =>
  paginateItems({
    items: filteredRows.value,
    pageIndex: pageIndex.value,
    pageSize: pageSize.value,
  })
);

const hasFilters = computed(() => hasActiveTogglPreviewFilters(filters));

watch(
  [
    () => filters.statuses,
    () => filters.dates,
    () => filters.descriptions,
    () => filters.projects,
    () => filters.tags,
    pageSize,
    () => props.rows,
  ],
  () => {
    pageIndex.value = 0;
  }
);

function updateStatuses(values: string[]) {
  filters.statuses = values.filter(
    (v): v is TogglRowImportStatus => v === 'pending' || v === 'imported'
  );
}

function resetFilters() {
  Object.assign(filters, createEmptyTogglPreviewFilters());
  emit('update:statusFilter', 'all');
}
</script>

<template>
  <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated">
    <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

    <!-- Table Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="label-eyebrow text-signal">
          {{ $t('csv.table.title') }}
        </span>
        <span class="tabular-telemetry border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted">
          {{ filteredRows.length }} / {{ rows.length }}
        </span>
        <button
          v-if="hasFilters"
          type="button"
          data-testid="csv-clear-column-filters"
          class="btn-press inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2.5 text-xs font-medium text-text-muted hover:border-signal hover:text-text-primary transition-colors"
          @click="resetFilters"
        >
          <X class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('csv.table.clearFilters') }}</span>
        </button>
      </div>

      <label class="inline-flex items-center gap-2 text-xs text-text-muted">
        <span>{{ $t('dashboard.pagination.rowsPerPage') }}</span>
        <select
          v-model.number="pageSize"
          data-testid="csv-table-page-size"
          class="tabular-telemetry h-8 border border-border-input bg-bg-primary px-2 text-xs text-text-primary focus:border-signal focus:outline-none"
        >
          <option v-for="sz in pageSizeOptions" :key="sz" :value="sz">
            {{ sz }}
          </option>
        </select>
      </label>
    </div>

    <!-- Keyboard-Scrollable Table Region with Sticky Header & Minimalist Column Filter Popovers -->
    <div
      tabindex="0"
      role="region"
      :aria-label="$t('csv.table.regionAria')"
      class="max-h-[600px] overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal"
    >
      <table class="w-full border-separate border-spacing-0 text-left text-sm">
        <caption class="sr-only">
          {{ $t('csv.table.caption') }}
        </caption>
        <thead class="sticky top-0 z-10 bg-bg-primary text-xs font-medium uppercase tracking-wider text-text-muted">
          <tr>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2.5 w-14">
              #
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2 whitespace-nowrap">
              <CsvColumnFilterHeader
                :model-value="filters.statuses"
                :options="filterOptions.statuses"
                :label="$t('csv.table.colStatus')"
                :searchable="false"
                test-id="csv-filter-status"
                @update:model-value="updateStatuses"
              />
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2 whitespace-nowrap">
              <CsvColumnFilterHeader
                v-model="filters.dates"
                :options="filterOptions.dates"
                :label="$t('dashboard.colDate')"
                :search-placeholder="$t('csv.table.searchDates')"
                test-id="csv-filter-date"
              />
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2">
              <CsvColumnFilterHeader
                v-model="filters.descriptions"
                :options="filterOptions.descriptions"
                :label="$t('dashboard.colDescription')"
                :search-placeholder="$t('csv.table.searchDescriptions')"
                test-id="csv-filter-description"
              />
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2">
              <CsvColumnFilterHeader
                v-model="filters.projects"
                :options="filterOptions.projects"
                :label="$t('dashboard.colProject')"
                :search-placeholder="$t('csv.table.searchProjects')"
                test-id="csv-filter-project"
              />
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2">
              <CsvColumnFilterHeader
                v-model="filters.tags"
                :options="filterOptions.tags"
                :label="$t('dashboard.colTags')"
                :search-placeholder="$t('csv.table.searchTags')"
                test-id="csv-filter-tags"
              />
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-3 py-2.5 text-right whitespace-nowrap">
              {{ $t('dashboard.colDuration') }}
            </th>
          </tr>
        </thead>

        <tbody class="divide-y divide-border-hairline">
          <tr v-if="paginated.items.length === 0">
            <td colspan="7" class="px-4 py-8 text-center text-ui text-text-muted">
              {{ $t('csv.table.emptyFiltered') }}
            </td>
          </tr>

          <tr
            v-for="row in paginated.items"
            :key="row.deterministicId"
            data-testid="csv-preview-row"
            class="hover:bg-bg-hover/60 transition-colors"
          >
            <td class="tabular-telemetry border-b border-border-subtle px-3 py-2.5 text-ui text-text-muted">
              {{ row.rowNumber }}
            </td>
            <td class="border-b border-border-subtle px-3 py-2.5 whitespace-nowrap">
              <span
                data-testid="csv-row-status-badge"
                class="inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium uppercase tracking-wider"
                :class="
                  row.importStatus === 'imported'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-signal/40 bg-signal-soft text-signal'
                "
              >
                <Check
                  v-if="row.importStatus === 'imported'"
                  class="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <Clock
                  v-else
                  class="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {{
                    row.importStatus === 'imported'
                      ? $t('csv.table.statusImported')
                      : $t('csv.table.statusPending')
                  }}
                </span>
              </span>
            </td>
            <td class="tabular-telemetry border-b border-border-subtle px-3 py-2.5 text-ui text-text-muted whitespace-nowrap">
              {{ row.startDateKey }}
            </td>
            <td class="border-b border-border-subtle px-3 py-2.5 text-text-primary">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-medium">{{ row.description }}</span>
                <span
                  v-if="row.taskName"
                  class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted"
                >
                  {{ row.taskName }}
                </span>
              </div>
            </td>
            <td class="border-b border-border-subtle px-3 py-2.5 text-ui text-text-muted">
              {{ row.projectName || $t('catalog.unassigned') }}
            </td>
            <td class="border-b border-border-subtle px-3 py-2.5">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="tag in row.tagNames"
                  :key="tag"
                  class="border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted"
                >
                  {{ tag }}
                </span>
              </div>
            </td>
            <td class="tabular-telemetry border-b border-border-subtle px-3 py-2.5 text-right font-semibold text-text-primary whitespace-nowrap">
              {{ formatHMS(row.durationSeconds) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    <div
      v-if="paginated.totalItems > 0"
      data-testid="csv-table-pagination"
      class="flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline bg-bg-primary/50 px-4 py-3 text-ui"
    >
      <span class="tabular-telemetry text-text-muted">
        {{
          $t('dashboard.pagination.showingRange', {
            start: paginated.startItem,
            end: paginated.endItem,
            total: paginated.totalItems,
          })
        }}
      </span>

      <div v-if="paginated.totalPages > 1" class="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="csv-pagination-first"
          :disabled="!paginated.hasPreviousPage"
          :aria-label="$t('dashboard.pagination.first')"
          class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover disabled:opacity-35"
          @click="pageIndex = 0"
        >
          <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="csv-pagination-prev"
          :disabled="!paginated.hasPreviousPage"
          class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-35"
          @click="pageIndex = Math.max(0, paginated.pageIndex - 1)"
        >
          <ChevronLeft class="h-4 w-4" aria-hidden="true" />
          <span>{{ $t('dashboard.pagination.previous') }}</span>
        </button>
        <span
          data-testid="csv-pagination-page"
          class="tabular-telemetry inline-flex h-8 items-center border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-muted"
        >
          {{
            $t('dashboard.pagination.pageOf', {
              page: paginated.pageNumber,
              total: paginated.totalPages,
            })
          }}
        </span>
        <button
          type="button"
          data-testid="csv-pagination-next"
          :disabled="!paginated.hasNextPage"
          class="btn-press inline-flex h-8 items-center gap-1 border border-border-hairline bg-bg-elevated px-2.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-35"
          @click="pageIndex = paginated.pageIndex + 1"
        >
          <span>{{ $t('dashboard.pagination.next') }}</span>
          <ChevronRight class="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="csv-pagination-last"
          :disabled="!paginated.hasNextPage"
          :aria-label="$t('dashboard.pagination.last')"
          class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary hover:bg-bg-hover disabled:opacity-35"
          @click="pageIndex = paginated.totalPages - 1"
        >
          <ChevronsRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
