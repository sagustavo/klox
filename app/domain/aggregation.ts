import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getQuarter,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { normalizeDescription, toDateKey } from './duration';
import {
  PROJECT_COLOR_PALETTE,
  buildTagNameMap,
  formatTaskHierarchyLabel,
} from './invariants';
import { resolveLogDateKey } from './trackerFeed';
import type {
  DashboardFilters,
  DateRangePreset,
  EntityId,
  GroupByDimension,
  Project,
  ProjectTag,
  SliceDimension,
  SupportedLocale,
  Task,
  TimeGranularity,
  TimeLog,
  WeekStartDay,
} from './types';

export const DASHBOARD_TABLE_PAGE_SIZE = 25;

export interface DateKeyBounds {
  startDateKey: string | null; // "YYYY-MM-DD" inclusive
  endDateKey: string | null; // "YYYY-MM-DD" inclusive
}

export interface DimensionCatalogContext {
  untaggedLabel?: string;
  noTaskLabel?: string;
  unassignedProjectLabel?: string;
  projects?: readonly Project[];
  tasks?: readonly Task[];
  tags?: readonly Pick<ProjectTag, 'id' | 'name'>[];
}

interface DimensionLookup {
  projectById?: Map<EntityId, Project>;
  taskById?: Map<EntityId, Task>;
  allTasks: readonly Task[];
  tagNameById?: Map<EntityId, string>;
}

function buildDimensionLookup(ctx: DimensionCatalogContext): DimensionLookup {
  return {
    projectById: ctx.projects ? new Map(ctx.projects.map((p) => [p.id, p])) : undefined,
    taskById: ctx.tasks ? new Map(ctx.tasks.map((t) => [t.id, t])) : undefined,
    allTasks: ctx.tasks ?? [],
    tagNameById: ctx.tags ? buildTagNameMap(ctx.tags) : undefined,
  };
}

function parseLocalCalendarDate(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * Computes inclusive YYYY-MM-DD bounds in the user's preferred IANA timezone and weekStartsOn setting.
 */
export function resolveDateKeyBounds(params: {
  preset: DateRangePreset;
  customStartDate?: string;
  customEndDate?: string;
  timeZone: string;
  weekStartsOn: WeekStartDay;
  now?: Date;
}): DateKeyBounds {
  const { preset, customStartDate, customEndDate, timeZone, weekStartsOn } = params;
  const nowInstant = params.now ?? new Date();
  let zonedNow: Date;
  try {
    zonedNow = new TZDate(nowInstant.getTime(), timeZone || 'UTC');
  } catch {
    zonedNow = new TZDate(nowInstant.getTime(), 'UTC');
  }

  const todayKey = format(zonedNow, 'yyyy-MM-dd');

  if (preset === 'all_time') {
    return { startDateKey: null, endDateKey: null };
  }
  if (preset === 'today') {
    return { startDateKey: todayKey, endDateKey: todayKey };
  }
  if (preset === 'last_7_days') {
    const start = addDays(zonedNow, -6);
    return { startDateKey: format(start, 'yyyy-MM-dd'), endDateKey: todayKey };
  }
  if (preset === 'this_week') {
    const start = startOfWeek(zonedNow, { weekStartsOn });
    const end = endOfWeek(zonedNow, { weekStartsOn });
    return {
      startDateKey: format(start, 'yyyy-MM-dd'),
      endDateKey: format(end, 'yyyy-MM-dd'),
    };
  }
  if (preset === 'this_month') {
    const start = startOfMonth(zonedNow);
    const end = endOfMonth(zonedNow);
    return {
      startDateKey: format(start, 'yyyy-MM-dd'),
      endDateKey: format(end, 'yyyy-MM-dd'),
    };
  }
  // custom
  return {
    startDateKey: customStartDate || null,
    endDateKey: customEndDate || null,
  };
}

/**
 * Filters historical TimeLogs reactively across all dimensions (FR-5.5).
 */
export function filterTimeLogs(params: {
  logs: readonly TimeLog[];
  filters: DashboardFilters;
  timeZone: string;
  weekStartsOn: WeekStartDay;
  now?: Date;
}): TimeLog[] {
  const { logs, filters, timeZone, weekStartsOn, now } = params;
  const effectiveTz = timeZone || 'UTC';
  const bounds = resolveDateKeyBounds({
    preset: filters.preset,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
    timeZone: effectiveTz,
    weekStartsOn,
    now,
  });

  const projectSet = new Set(filters.projectIds);
  const taskSet = new Set(filters.taskIds);
  const tagSet = new Set(filters.tagIds);
  const descSet = new Set(filters.descriptions ?? []);
  const queryNorm = normalizeDescription(filters.searchQuery);

  return logs.filter((log) => {
    const logDateKey = resolveLogDateKey(log, effectiveTz);
    if (bounds.startDateKey && logDateKey < bounds.startDateKey) return false;
    if (bounds.endDateKey && logDateKey > bounds.endDateKey) return false;

    if (projectSet.size > 0 && !projectSet.has(log.projectId)) return false;
    if (taskSet.size > 0 && (!log.taskId || !taskSet.has(log.taskId))) return false;
    if (tagSet.size > 0 && !log.tagIds.some((id) => tagSet.has(id))) return false;

    if (descSet.size > 0) {
      const descNorm = log.normalizedDescription || normalizeDescription(log.description);
      if (!descSet.has(descNorm)) return false;
    }

    if (queryNorm) {
      const descNorm = log.normalizedDescription || normalizeDescription(log.description);
      const projNorm = normalizeDescription(log.projectNameSnapshot);
      if (!descNorm.includes(queryNorm) && !projNorm.includes(queryNorm)) {
        return false;
      }
    }

    return true;
  });
}

export interface DescriptionFilterOption {
  value: string; // normalizedDescription
  label: string; // display Description
  count: number;
}

/**
 * Extracts deduplicated Log Description filter options ordered by frequency descending.
 */
export function extractDistinctDescriptionOptions(
  logs: readonly TimeLog[]
): DescriptionFilterOption[] {
  const map = new Map<string, DescriptionFilterOption>();

  for (const log of logs) {
    const norm = log.normalizedDescription || normalizeDescription(log.description);
    if (!norm) continue;
    const existing = map.get(norm);
    if (!existing) {
      map.set(norm, {
        value: norm,
        label: log.description.trim() || norm,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

export interface PizzaSlice {
  key: string;
  label: string;
  color: string;
  seconds: number;
  percentage: number;
}

export interface PizzaAggregation {
  totalTrackedSeconds: number;
  slices: PizzaSlice[];
}

function extractDimensionEntries(
  log: TimeLog,
  dimension: SliceDimension,
  ctx: DimensionCatalogContext,
  lookup: DimensionLookup
): Array<{ key: string; label: string; color?: string }> {
  if (dimension === 'project') {
    const liveProj = lookup.projectById?.get(log.projectId);
    const label =
      liveProj?.systemKey === 'unassigned'
        ? ctx.unassignedProjectLabel ?? liveProj.name
        : liveProj?.name ?? log.projectNameSnapshot;
    return [
      {
        key: log.projectId,
        label,
        color: liveProj?.color ?? log.projectColorSnapshot,
      },
    ];
  }

  if (dimension === 'task') {
    if (!log.taskId) {
      return [
        {
          key: '__no_task__',
          label: ctx.noTaskLabel ?? 'No Task',
          color: '#71717A',
        },
      ];
    }
    const liveTask = lookup.taskById?.get(log.taskId);
    const label = liveTask
      ? formatTaskHierarchyLabel(liveTask, lookup.allTasks)
      : log.taskNameSnapshot || log.taskId;
    return [
      {
        key: log.taskId,
        label,
      },
    ];
  }

  if (dimension === 'description') {
    const key = log.normalizedDescription || normalizeDescription(log.description);
    return [
      {
        key: key || '__empty_desc__',
        label: log.description || 'Untitled task',
      },
    ];
  }

  // dimension === 'tag'
  const untaggedLabel = ctx.untaggedLabel ?? 'Untagged';
  if (lookup.tagNameById) {
    const resolved: Array<{ key: string; label: string; color?: string }> = [];
    for (const tagId of log.tagIds) {
      const name = lookup.tagNameById.get(tagId);
      if (name !== undefined) {
        resolved.push({ key: tagId, label: `#${name}` });
      }
    }
    if (resolved.length === 0) {
      return [{ key: '__untagged__', label: untaggedLabel, color: '#71717A' }];
    }
    return resolved;
  }

  if (log.tagIds.length === 0) {
    return [{ key: '__untagged__', label: untaggedLabel, color: '#71717A' }];
  }
  return log.tagIds.map((tagId) => ({
    key: tagId,
    label: `#${tagId}`,
  }));
}

/**
 * Visualization 1 — Pizza (Donut) Chart aggregation by Project, Task, Tag, or Description (FR-5.4).
 */
export function aggregatePizzaSlices(
  params: {
    logs: readonly TimeLog[];
    dimension: SliceDimension;
  } & DimensionCatalogContext
): PizzaAggregation {
  const lookup = buildDimensionLookup(params);
  const totalTrackedSeconds = params.logs.reduce((acc, l) => acc + l.durationSeconds, 0);

  const buckets = new Map<string, { key: string; label: string; color?: string; seconds: number }>();

  for (const log of params.logs) {
    const entries = extractDimensionEntries(log, params.dimension, params, lookup);
    for (const entry of entries) {
      const existing = buckets.get(entry.key);
      if (!existing) {
        buckets.set(entry.key, {
          key: entry.key,
          label: entry.label,
          color: entry.color,
          seconds: log.durationSeconds,
        });
      } else {
        existing.seconds += log.durationSeconds;
      }
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.seconds - a.seconds);
  const denom = sorted.reduce((acc, s) => acc + s.seconds, 0) || 1;

  const slices: PizzaSlice[] = sorted.map((item, idx) => ({
    key: item.key,
    label: item.label,
    color:
      item.color ??
      PROJECT_COLOR_PALETTE[idx % PROJECT_COLOR_PALETTE.length] ??
      '#3B82F6',
    seconds: item.seconds,
    percentage: Math.round((item.seconds / denom) * 1000) / 10,
  }));

  return {
    totalTrackedSeconds,
    slices,
  };
}

export interface DailyStackedSeries {
  key: string;
  label: string;
  color: string;
  dataSeconds: number[];
}

export interface TimeSeriesStackedAggregation {
  granularity: TimeGranularity;
  bucketKeys: string[];
  dateKeys: string[]; // Alias of bucketKeys for backward compatibility
  series: DailyStackedSeries[];
}

export type DailyStackedAggregation = TimeSeriesStackedAggregation;

/**
 * Maps a YYYY-MM-DD calendar `dateKey` to its canonical temporal bucket key
 * for Day, Week (respecting `weekStartsOn`), Month, Quarter, or Year granularity.
 */
export function resolveBucketKeyForDateKey(
  dateKey: string,
  granularity: TimeGranularity,
  weekStartsOn: WeekStartDay = 1
): string {
  if (granularity === 'day') return dateKey;
  if (granularity === 'month') return dateKey.slice(0, 7);
  if (granularity === 'year') return dateKey.slice(0, 4);

  const localDate = parseLocalCalendarDate(dateKey);
  if (!localDate) return dateKey;

  if (granularity === 'week') {
    const weekStart = startOfWeek(localDate, { weekStartsOn });
    return format(weekStart, 'yyyy-MM-dd');
  }

  // quarter
  return `${localDate.getFullYear()}-Q${getQuarter(localDate)}`;
}

/**
 * Formats a canonical temporal bucket key into a localized Chart.js X-axis tick label.
 */
export function formatTimeBucketLabel(
  bucketKey: string,
  granularity: TimeGranularity,
  locale: SupportedLocale = 'en'
): string {
  const intlLocale = locale === 'pt-br' ? 'pt-BR' : 'en-US';

  if (granularity === 'year') return bucketKey;
  if (granularity === 'quarter') return bucketKey.replace('-', ' ');

  if (granularity === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(bucketKey);
    if (!match) return bucketKey;
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15, 12, 0, 0));
    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }

  const parsed = parseLocalCalendarDate(bucketKey);
  if (!parsed) return bucketKey;
  const utcMid = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
  const shortDate = new Intl.DateTimeFormat(intlLocale, {
    timeZone: 'UTC',
    month: 'short',
    day: '2-digit',
  }).format(utcMid);

  if (granularity === 'week') {
    return locale === 'pt-br' ? `Sem. ${shortDate}` : `W ${shortDate}`;
  }

  return shortDate;
}

function enumerateBucketKeys(params: {
  startDateKey: string;
  endDateKey: string;
  granularity: TimeGranularity;
  weekStartsOn: WeekStartDay;
}): string[] {
  const start = parseLocalCalendarDate(params.startDateKey);
  const end = parseLocalCalendarDate(params.endDateKey);
  if (!start || !end || start > end) return [];

  if (params.granularity === 'day') {
    return eachDayOfInterval({ start, end })
      .slice(-90)
      .map((d) => format(d, 'yyyy-MM-dd'));
  }

  if (params.granularity === 'week') {
    return eachWeekOfInterval({ start, end }, { weekStartsOn: params.weekStartsOn })
      .slice(-104)
      .map((d) => format(d, 'yyyy-MM-dd'));
  }

  if (params.granularity === 'month') {
    return eachMonthOfInterval({ start: startOfMonth(start), end: startOfMonth(end) })
      .slice(-60)
      .map((d) => format(d, 'yyyy-MM'));
  }

  if (params.granularity === 'quarter') {
    return eachQuarterOfInterval({ start, end })
      .slice(-40)
      .map((d) => `${d.getFullYear()}-Q${getQuarter(d)}`);
  }

  // year
  return eachYearOfInterval({ start, end })
    .slice(-20)
    .map((d) => String(d.getFullYear()));
}

function fallbackEmptyBucketKeys(
  granularity: TimeGranularity,
  weekStartsOn: WeekStartDay,
  timeZone: string
): string[] {
  const todayKey = toDateKey(new Date(), timeZone || 'UTC');
  const today = parseLocalCalendarDate(todayKey) ?? new Date();

  if (granularity === 'day') {
    return [
      format(addDays(today, -2), 'yyyy-MM-dd'),
      format(addDays(today, -1), 'yyyy-MM-dd'),
      format(today, 'yyyy-MM-dd'),
    ];
  }
  if (granularity === 'week') {
    const curWeek = startOfWeek(today, { weekStartsOn });
    return [
      format(addWeeks(curWeek, -2), 'yyyy-MM-dd'),
      format(addWeeks(curWeek, -1), 'yyyy-MM-dd'),
      format(curWeek, 'yyyy-MM-dd'),
    ];
  }
  if (granularity === 'month') {
    const curMonth = startOfMonth(today);
    return [
      format(addMonths(curMonth, -2), 'yyyy-MM'),
      format(addMonths(curMonth, -1), 'yyyy-MM'),
      format(curMonth, 'yyyy-MM'),
    ];
  }
  if (granularity === 'quarter') {
    return [-2, -1, 0].map((offset) => {
      const qDate = addQuarters(today, offset);
      return `${qDate.getFullYear()}-Q${getQuarter(qDate)}`;
    });
  }
  return [-2, -1, 0].map((offset) => String(addYears(today, offset).getFullYear()));
}

/**
 * Visualization 2 — Stacked Histogram over time supporting Day, Week, Month, Quarter, and Year
 * temporal buckets and all 4 stacking dimensions (Project, Task, Tag, Description) (FR-5.4).
 */
export function aggregateTimeSeriesStacked(
  params: {
    logs: readonly TimeLog[];
    dimension: SliceDimension;
    granularity: TimeGranularity;
    bounds: DateKeyBounds;
    weekStartsOn: WeekStartDay;
    timeZone?: string;
  } & DimensionCatalogContext
): TimeSeriesStackedAggregation {
  const effectiveTz = params.timeZone || 'UTC';
  const lookup = buildDimensionLookup(params);

  let bucketKeys: string[] = [];
  if (params.bounds.startDateKey && params.bounds.endDateKey) {
    bucketKeys = enumerateBucketKeys({
      startDateKey: params.bounds.startDateKey,
      endDateKey: params.bounds.endDateKey,
      granularity: params.granularity,
      weekStartsOn: params.weekStartsOn,
    });
  }

  if (bucketKeys.length === 0) {
    if (params.logs.length > 0) {
      let minKey: string | null = null;
      let maxKey: string | null = null;
      for (const log of params.logs) {
        const dk = resolveLogDateKey(log, effectiveTz);
        if (minKey === null || dk < minKey) minKey = dk;
        if (maxKey === null || dk > maxKey) maxKey = dk;
      }
      if (minKey && maxKey) {
        const startBound =
          params.bounds.startDateKey && params.bounds.startDateKey > minKey
            ? params.bounds.startDateKey
            : minKey;
        const endBound =
          params.bounds.endDateKey && params.bounds.endDateKey < maxKey
            ? params.bounds.endDateKey
            : maxKey;
        if (startBound <= endBound) {
          bucketKeys = enumerateBucketKeys({
            startDateKey: startBound,
            endDateKey: endBound,
            granularity: params.granularity,
            weekStartsOn: params.weekStartsOn,
          });
        }
      }
    }
    if (bucketKeys.length === 0) {
      bucketKeys = fallbackEmptyBucketKeys(
        params.granularity,
        params.weekStartsOn,
        effectiveTz
      );
    }
  }

  const bucketIndex = new Map(bucketKeys.map((bk, i) => [bk, i]));
  const seriesMap = new Map<
    string,
    { key: string; label: string; color?: string; dataSeconds: number[]; total: number }
  >();

  for (const log of params.logs) {
    const dk = resolveLogDateKey(log, effectiveTz);
    const bk = resolveBucketKeyForDateKey(dk, params.granularity, params.weekStartsOn);
    const bIdx = bucketIndex.get(bk);
    if (bIdx === undefined) continue;

    const entries = extractDimensionEntries(log, params.dimension, params, lookup);
    for (const entry of entries) {
      let s = seriesMap.get(entry.key);
      if (!s) {
        s = {
          key: entry.key,
          label: entry.label,
          color: entry.color,
          dataSeconds: new Array(bucketKeys.length).fill(0),
          total: 0,
        };
        seriesMap.set(entry.key, s);
      }
      s.dataSeconds[bIdx] = (s.dataSeconds[bIdx] ?? 0) + log.durationSeconds;
      s.total += log.durationSeconds;
    }
  }

  const sortedSeries = Array.from(seriesMap.values()).sort((a, b) => b.total - a.total);

  return {
    granularity: params.granularity,
    bucketKeys,
    dateKeys: bucketKeys,
    series: sortedSeries.map((s, idx) => ({
      key: s.key,
      label: s.label,
      color:
        s.color ??
        PROJECT_COLOR_PALETTE[idx % PROJECT_COLOR_PALETTE.length] ??
        '#3B82F6',
      dataSeconds: s.dataSeconds,
    })),
  };
}

/**
 * Convenience wrapper for daily stacked bar chart aggregation.
 */
export function aggregateDailyStacked(
  params: {
    logs: readonly TimeLog[];
    dimension: SliceDimension;
    bounds: DateKeyBounds;
    weekStartsOn?: WeekStartDay;
    timeZone?: string;
  } & DimensionCatalogContext
): TimeSeriesStackedAggregation {
  return aggregateTimeSeriesStacked({
    ...params,
    granularity: 'day',
    weekStartsOn: params.weekStartsOn ?? 1,
  });
}

export interface TagBreakdownGroup {
  tagKey: string;
  tagLabel: string;
  count: number;
  subtotalSeconds: number;
  logs: TimeLog[];
}

export interface BreakdownSubgroup {
  key: string;
  label: string;
  color?: string;
  count: number;
  subtotalSeconds: number;
  logs: TimeLog[];
}

export interface BreakdownPrimaryGroup {
  key: string;
  label: string;
  color?: string;
  count: number;
  subtotalSeconds: number;
  logs: TimeLog[];
  subgroups: BreakdownSubgroup[];
}

function isFallbackBucketKey(key: string): boolean {
  return key === '__untagged__' || key === '__no_task__';
}

function sortBreakdownGroups<T extends { key: string; subtotalSeconds: number }>(
  groups: T[]
): T[] {
  return groups.sort((a, b) => {
    const aFallback = isFallbackBucketKey(a.key);
    const bFallback = isFallbackBucketKey(b.key);
    if (aFallback !== bFallback) return aFallback ? 1 : -1;
    return b.subtotalSeconds - a.subtotalSeconds;
  });
}

/**
 * Visualization 3 — 2-level hierarchical breakdown across Project, Task, Tag, and Description (FR-5.4).
 */
export function groupLogsTwoLevel(
  params: {
    logs: readonly TimeLog[];
    primaryDimension: SliceDimension;
    secondaryDimension?: GroupByDimension;
  } & DimensionCatalogContext
): BreakdownPrimaryGroup[] {
  const lookup = buildDimensionLookup(params);
  const primaryMap = new Map<string, BreakdownPrimaryGroup>();

  for (const log of params.logs) {
    const primaryEntries = extractDimensionEntries(log, params.primaryDimension, params, lookup);
    for (const entry of primaryEntries) {
      const existing = primaryMap.get(entry.key);
      if (!existing) {
        primaryMap.set(entry.key, {
          key: entry.key,
          label: entry.label,
          color: entry.color,
          count: 1,
          subtotalSeconds: log.durationSeconds,
          logs: [log],
          subgroups: [],
        });
      } else {
        existing.count += 1;
        existing.subtotalSeconds += log.durationSeconds;
        existing.logs.push(log);
      }
    }
  }

  const primaryList = sortBreakdownGroups(Array.from(primaryMap.values()));

  const secondaryDim =
    params.secondaryDimension &&
    params.secondaryDimension !== 'none' &&
    params.secondaryDimension !== params.primaryDimension
      ? params.secondaryDimension
      : null;

  if (secondaryDim) {
    for (const primary of primaryList) {
      const subMap = new Map<string, BreakdownSubgroup>();
      for (const log of primary.logs) {
        const subEntries = extractDimensionEntries(log, secondaryDim, params, lookup);
        for (const subEntry of subEntries) {
          const existingSub = subMap.get(subEntry.key);
          if (!existingSub) {
            subMap.set(subEntry.key, {
              key: subEntry.key,
              label: subEntry.label,
              color: subEntry.color,
              count: 1,
              subtotalSeconds: log.durationSeconds,
              logs: [log],
            });
          } else {
            existingSub.count += 1;
            existingSub.subtotalSeconds += log.durationSeconds;
            existingSub.logs.push(log);
          }
        }
      }
      primary.subgroups = sortBreakdownGroups(Array.from(subMap.values()));
    }
  }

  return primaryList;
}

/**
 * Visualization 3 — Groups filtered TimeLogs by Tag (collapsible headers + "Untagged" bucket).
 */
export function groupLogsByTag(
  logs: readonly TimeLog[],
  untaggedLabel = 'Untagged',
  tags?: readonly Pick<ProjectTag, 'id' | 'name'>[]
): TagBreakdownGroup[] {
  return groupLogsTwoLevel({
    logs,
    primaryDimension: 'tag',
    untaggedLabel,
    tags,
  }).map((g) => ({
    tagKey: g.key,
    tagLabel: g.label,
    count: g.count,
    subtotalSeconds: g.subtotalSeconds,
    logs: g.logs,
  }));
}

export interface PaginatedSlice<T> {
  items: T[];
  pageIndex: number;
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/**
 * Pure slice pagination helper for large filtered TimeLog tables and grouped breakdowns (FR-5.4).
 */
export function paginateItems<T>(params: {
  items: readonly T[];
  pageIndex: number;
  pageSize?: number;
}): PaginatedSlice<T> {
  const pageSize = Math.max(1, Math.floor(params.pageSize ?? DASHBOARD_TABLE_PAGE_SIZE));
  const totalItems = params.items.length;

  if (totalItems === 0) {
    return {
      items: [],
      pageIndex: 0,
      pageNumber: 0,
      pageSize,
      totalItems: 0,
      totalPages: 0,
      startItem: 0,
      endItem: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const safeRequested = Number.isFinite(params.pageIndex) ? Math.floor(params.pageIndex) : 0;
  const pageIndex = Math.min(Math.max(0, safeRequested), totalPages - 1);
  const startOffset = pageIndex * pageSize;
  const sliced = params.items.slice(startOffset, startOffset + pageSize);

  return {
    items: sliced,
    pageIndex,
    pageNumber: pageIndex + 1,
    pageSize,
    totalItems,
    totalPages,
    startItem: startOffset + 1,
    endItem: startOffset + sliced.length,
    hasPreviousPage: pageIndex > 0,
    hasNextPage: pageIndex < totalPages - 1,
  };
}
