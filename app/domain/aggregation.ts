import { TZDate } from '@date-fns/tz';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { normalizeDescription } from './duration';
import { PROJECT_COLOR_PALETTE } from './invariants';
import type {
  DashboardFilters,
  DateRangePreset,
  SliceDimension,
  TimeLog,
  WeekStartDay,
} from './types';

export interface DateKeyBounds {
  startDateKey: string | null; // "YYYY-MM-DD" inclusive
  endDateKey: string | null; // "YYYY-MM-DD" inclusive
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
    zonedNow = new TZDate(nowInstant.getTime(), timeZone);
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
    const start = subDays(zonedNow, 6);
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
 * Filters historical TimeLogs reactively across all dimensions.
 */
export function filterTimeLogs(params: {
  logs: readonly TimeLog[];
  filters: DashboardFilters;
  timeZone: string;
  weekStartsOn: WeekStartDay;
  now?: Date;
}): TimeLog[] {
  const { logs, filters, timeZone, weekStartsOn, now } = params;
  const bounds = resolveDateKeyBounds({
    preset: filters.preset,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
    timeZone,
    weekStartsOn,
    now,
  });

  const projectSet = new Set(filters.projectIds);
  const taskSet = new Set(filters.taskIds);
  const tagSet = new Set(filters.tagIds);
  const queryNorm = normalizeDescription(filters.searchQuery);

  return logs.filter((log) => {
    if (bounds.startDateKey && log.dateKey < bounds.startDateKey) return false;
    if (bounds.endDateKey && log.dateKey > bounds.endDateKey) return false;

    if (projectSet.size > 0 && !projectSet.has(log.projectId)) return false;
    if (taskSet.size > 0 && (!log.taskId || !taskSet.has(log.taskId))) return false;
    if (tagSet.size > 0 && !log.tagIds.some((id) => tagSet.has(id))) return false;

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
  untaggedLabel: string
): Array<{ key: string; label: string; color?: string }> {
  if (dimension === 'project') {
    return [
      {
        key: log.projectId,
        label: log.projectNameSnapshot,
        color: log.projectColorSnapshot,
      },
    ];
  }
  if (dimension === 'description') {
    const key = log.normalizedDescription || normalizeDescription(log.description);
    return [
      {
        key,
        label: log.description,
      },
    ];
  }
  // dimension === 'tag'
  if (log.tagIds.length === 0) {
    return [{ key: '__untagged__', label: untaggedLabel, color: '#71717A' }];
  }
  return log.tagIds.map((tagId, idx) => ({
    key: tagId,
    label: `#${log.tagNamesSnapshot[idx] ?? tagId}`,
  }));
}

/**
 * Visualization 1 — Pizza (Donut) Chart aggregation by Tag, Project, or Task Description.
 */
export function aggregatePizzaSlices(params: {
  logs: readonly TimeLog[];
  dimension: SliceDimension;
  untaggedLabel?: string;
}): PizzaAggregation {
  const untaggedLabel = params.untaggedLabel ?? 'Untagged';
  const totalTrackedSeconds = params.logs.reduce((acc, l) => acc + l.durationSeconds, 0);

  const buckets = new Map<string, { key: string; label: string; color?: string; seconds: number }>();

  for (const log of params.logs) {
    const entries = extractDimensionEntries(log, params.dimension, untaggedLabel);
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

export interface DailyStackedAggregation {
  dateKeys: string[]; // Ordered YYYY-MM-DD labels across X axis
  series: DailyStackedSeries[];
}

/**
 * Visualization 2 — Duration by Day Stacked Bar Chart aggregation by Tag, Project, or Task Description.
 */
export function aggregateDailyStacked(params: {
  logs: readonly TimeLog[];
  dimension: SliceDimension;
  bounds: DateKeyBounds;
  untaggedLabel?: string;
}): DailyStackedAggregation {
  const untaggedLabel = params.untaggedLabel ?? 'Untagged';

  let dateKeys: string[] = [];
  if (params.bounds.startDateKey && params.bounds.endDateKey) {
    try {
      const start = parseISO(params.bounds.startDateKey);
      const end = parseISO(params.bounds.endDateKey);
      if (start <= end) {
        dateKeys = eachDayOfInterval({ start, end })
          .slice(0, 62)
          .map((d) => format(d, 'yyyy-MM-dd'));
      }
    } catch {
      dateKeys = [];
    }
  }

  if (dateKeys.length === 0) {
    const distinct = Array.from(new Set(params.logs.map((l) => l.dateKey))).sort();
    if (distinct.length > 0) {
      dateKeys = distinct;
    } else {
      const today = format(new Date(), 'yyyy-MM-dd');
      dateKeys = [format(addDays(new Date(), -2), 'yyyy-MM-dd'), format(addDays(new Date(), -1), 'yyyy-MM-dd'), today];
    }
  }

  const dayIndex = new Map(dateKeys.map((dk, i) => [dk, i]));
  const seriesMap = new Map<
    string,
    { key: string; label: string; color?: string; dataSeconds: number[]; total: number }
  >();

  for (const log of params.logs) {
    const dIdx = dayIndex.get(log.dateKey);
    if (dIdx === undefined) continue;
    const entries = extractDimensionEntries(log, params.dimension, untaggedLabel);
    for (const entry of entries) {
      let s = seriesMap.get(entry.key);
      if (!s) {
        s = {
          key: entry.key,
          label: entry.label,
          color: entry.color,
          dataSeconds: new Array(dateKeys.length).fill(0),
          total: 0,
        };
        seriesMap.set(entry.key, s);
      }
      s.dataSeconds[dIdx] = (s.dataSeconds[dIdx] ?? 0) + log.durationSeconds;
      s.total += log.durationSeconds;
    }
  }

  const sortedSeries = Array.from(seriesMap.values()).sort((a, b) => b.total - a.total);

  return {
    dateKeys,
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

export interface TagBreakdownGroup {
  tagKey: string;
  tagLabel: string;
  count: number;
  subtotalSeconds: number;
  logs: TimeLog[];
}

/**
 * Visualization 3 — Groups filtered TimeLogs by Tag (collapsible headers + "Untagged" bucket).
 */
export function groupLogsByTag(
  logs: readonly TimeLog[],
  untaggedLabel = 'Untagged'
): TagBreakdownGroup[] {
  const groups = new Map<string, TagBreakdownGroup>();

  for (const log of logs) {
    if (log.tagIds.length === 0) {
      const key = '__untagged__';
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          tagKey: key,
          tagLabel: untaggedLabel,
          count: 1,
          subtotalSeconds: log.durationSeconds,
          logs: [log],
        });
      } else {
        existing.count += 1;
        existing.subtotalSeconds += log.durationSeconds;
        existing.logs.push(log);
      }
    } else {
      log.tagIds.forEach((tagId, idx) => {
        const label = `#${log.tagNamesSnapshot[idx] ?? tagId}`;
        const existing = groups.get(tagId);
        if (!existing) {
          groups.set(tagId, {
            tagKey: tagId,
            tagLabel: label,
            count: 1,
            subtotalSeconds: log.durationSeconds,
            logs: [log],
          });
        } else {
          existing.count += 1;
          existing.subtotalSeconds += log.durationSeconds;
          existing.logs.push(log);
        }
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.tagKey === '__untagged__') return 1;
    if (b.tagKey === '__untagged__') return -1;
    return b.subtotalSeconds - a.subtotalSeconds;
  });
}
