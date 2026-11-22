import { normalizeDescription, toDateKey } from './duration';
import type { EntityId, TimeLog } from './types';

export const TRACKER_FEED_WINDOW_DAYS = 7;

/**
 * Collapsible summary group of same-day TimeLog records sharing identical
 * `(normalizedDescription, projectId, taskId, tagIds)` metadata (FR-5.1).
 */
export interface TrackerLogGroup {
  /** Deterministic collision-free key (`dateKey` + metadata signature) */
  groupKey: string;
  /** Intra-day metadata signature over `(normalizedDescription, projectId, taskId, tagIds)` */
  signature: string;
  dateKey: string;
  description: string;
  normalizedDescription: string;
  projectId: EntityId;
  projectNameSnapshot: string;
  projectColorSnapshot: string;
  taskId?: EntityId;
  taskNameSnapshot?: string;
  tagIds: EntityId[];
  tagNamesSnapshot: string[];
  /** True when at least one execution in the group is billable */
  isBillable: boolean;
  /** True when every execution in the group is billable (drives bulk toggle target) */
  allBillable: boolean;
  /** Number of TimeLog executions in this group */
  count: number;
  /** True when count > 1 (renders as an expandable accordion summary row) */
  isGrouped: boolean;
  /** Exact integer sum of durationSeconds across all executions in the group */
  totalSeconds: number;
  /** Earliest startTime (UTC ISO) among executions in the group */
  earliestStartTime: string;
  /** Latest startTime (UTC ISO) among executions in the group (drives intra-day order) */
  latestStartTime: string;
  /** Latest endTime (UTC ISO) among executions in the group */
  latestEndTime: string;
  /** Individual TimeLog executions sorted descending by startTime (newest first) */
  items: TimeLog[];
}

export interface TrackerDayGroup {
  dateKey: string; // "YYYY-MM-DD" computed in UserPreferences.timeZone
  totalSeconds: number;
  items: TimeLog[]; // Sorted descending by startTime
  entryGroups: TrackerLogGroup[]; // Same-day metadata-collapsed groups (FR-5.1), sorted descending by latestStartTime
}

export interface TrackerFeedWindow {
  pageIndex: number; // 0-based active window index (0 = most recent window)
  pageNumber: number; // 1-based page number (0 when empty)
  totalPages: number;
  windowSizeDays: number;
  totalDistinctDays: number;
  totalLogsCount: number;
  days: TrackerDayGroup[]; // Strictly <= windowSizeDays distinct calendar days
  windowLogsCount: number;
  windowTotalSeconds: number;
  newestDateKey: string | null;
  oldestDateKey: string | null;
  hasPreviousPage: boolean; // pageIndex > 0 (newer window)
  hasNextPage: boolean; // pageIndex < totalPages - 1 (older window)
}

/**
 * Resolves a TimeLog's calendar day ("YYYY-MM-DD") in the user's active IANA timezone.
 * Fast-paths to the stored `log.dateKey` when `log.timeZone` already matches `timeZone`,
 * avoiding TZDate allocations across thousands of records.
 */
export function resolveLogDateKey(log: TimeLog, timeZone: string): string {
  const effectiveTz = timeZone || 'UTC';
  if (log.dateKey && log.timeZone === effectiveTz) {
    return log.dateKey;
  }
  return toDateKey(log.startTime, effectiveTz);
}

/**
 * Encodes a string with its character length prefix (`"<len>:<value>"`) so
 * composite keys remain printable ASCII and mathematically collision-free.
 */
function encodeSegment(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * Canonicalizes `tagIds` as a deduplicated, lexicographically sorted signature
 * so tag order variations (`['b','a']` vs `['a','b']`) still group together.
 */
function canonicalizeTagIds(tagIds: readonly EntityId[]): string {
  if (tagIds.length === 0) return '';
  if (tagIds.length === 1) return encodeSegment(tagIds[0]!);

  const uniqueSorted = Array.from(new Set(tagIds)).sort();
  return uniqueSorted.map(encodeSegment).join(',');
}

/**
 * Builds the deterministic intra-day grouping signature for `(normalizedDescription, projectId, taskId, tagIds)`.
 */
export function buildSameDayGroupSignature(log: TimeLog): string {
  const normDesc = log.normalizedDescription || normalizeDescription(log.description);
  const taskId = log.taskId ?? '';
  return `${encodeSegment(normDesc)}|${encodeSegment(log.projectId)}|${encodeSegment(taskId)}|[${canonicalizeTagIds(log.tagIds)}]`;
}

function compareLogsDesc(a: TimeLog, b: TimeLog): number {
  if (a.startTime !== b.startTime) {
    return a.startTime < b.startTime ? 1 : -1;
  }
  if (a.endTime !== b.endTime) {
    return a.endTime < b.endTime ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Collapses TimeLog entries belonging to a single `dateKey` into `TrackerLogGroup` rows
 * whenever `(normalizedDescription, projectId, taskId, tagIds)` match (FR-5.1).
 *
 * Groups are ordered descending by their most recent execution's `startTime`, and
 * `items` inside each group are ordered descending by `startTime`.
 */
export function groupSameDayEntries(
  items: readonly TimeLog[],
  dateKey: string,
  options?: { alreadySortedDesc?: boolean }
): TrackerLogGroup[] {
  if (items.length === 0) return [];

  const orderedItems =
    options?.alreadySortedDesc || items.length === 1
      ? items
      : [...items].sort(compareLogsDesc);

  const groupMap = new Map<string, TrackerLogGroup>();

  for (const log of orderedItems) {
    const signature = buildSameDayGroupSignature(log);
    const existing = groupMap.get(signature);

    if (!existing) {
      const normDesc = log.normalizedDescription || normalizeDescription(log.description);
      groupMap.set(signature, {
        groupKey: `${dateKey}|${signature}`,
        signature,
        dateKey,
        description: log.description,
        normalizedDescription: normDesc,
        projectId: log.projectId,
        projectNameSnapshot: log.projectNameSnapshot,
        projectColorSnapshot: log.projectColorSnapshot,
        ...(log.taskId ? { taskId: log.taskId } : {}),
        ...(log.taskNameSnapshot ? { taskNameSnapshot: log.taskNameSnapshot } : {}),
        tagIds: [...log.tagIds],
        tagNamesSnapshot: [...log.tagNamesSnapshot],
        isBillable: log.isBillable,
        allBillable: log.isBillable,
        count: 1,
        isGrouped: false,
        totalSeconds: log.durationSeconds,
        earliestStartTime: log.startTime,
        latestStartTime: log.startTime,
        latestEndTime: log.endTime,
        items: [log],
      });
    } else {
      existing.items.push(log);
      existing.count = existing.items.length;
      existing.isGrouped = true;
      existing.totalSeconds += log.durationSeconds;
      if (log.isBillable) {
        existing.isBillable = true;
      } else {
        existing.allBillable = false;
      }
      if (log.startTime < existing.earliestStartTime) {
        existing.earliestStartTime = log.startTime;
      }
      if (log.startTime > existing.latestStartTime) {
        existing.latestStartTime = log.startTime;
      }
      if (log.endTime > existing.latestEndTime) {
        existing.latestEndTime = log.endTime;
      }
    }
  }

  return Array.from(groupMap.values());
}

/**
 * Groups historical TimeLogs into descending calendar-day buckets in `timeZone`.
 * Uses direct ASCII comparisons on ISO-8601 UTC strings & YYYY-MM-DD keys for O(N) throughput
 * on 3,000–10,000+ records.
 */
export function groupLogsByCalendarDay(
  logs: readonly TimeLog[],
  timeZone: string
): TrackerDayGroup[] {
  if (logs.length === 0) return [];

  const effectiveTz = timeZone || 'UTC';
  const groups = new Map<string, TrackerDayGroup>();

  for (const log of logs) {
    const dateKey = resolveLogDateKey(log, effectiveTz);
    const existing = groups.get(dateKey);
    if (!existing) {
      groups.set(dateKey, {
        dateKey,
        totalSeconds: log.durationSeconds,
        items: [log],
        entryGroups: [],
      });
    } else {
      existing.totalSeconds += log.durationSeconds;
      existing.items.push(log);
    }
  }

  const dayList = Array.from(groups.values());

  // Sort items within each day descending by startTime (newest first), then collapse identical metadata (FR-5.1)
  for (const day of dayList) {
    if (day.items.length > 1) {
      day.items.sort(compareLogsDesc);
    }
    day.entryGroups = groupSameDayEntries(day.items, day.dateKey, {
      alreadySortedDesc: true,
    });
  }

  // Sort distinct calendar days descending by YYYY-MM-DD dateKey
  dayList.sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0));

  return dayList;
}

/**
 * Slices pre-grouped calendar days into a discrete 7-day window in O(1) time.
 * Only the returned `days` array is mounted into the DOM.
 */
export function sliceTrackerFeedWindow(params: {
  dayGroups: readonly TrackerDayGroup[];
  pageIndex: number;
  windowSizeDays?: number;
  totalLogsCount?: number;
}): TrackerFeedWindow {
  const windowSizeDays = Math.max(
    1,
    Math.floor(params.windowSizeDays ?? TRACKER_FEED_WINDOW_DAYS)
  );
  const totalDistinctDays = params.dayGroups.length;
  const totalLogsCount =
    params.totalLogsCount ??
    params.dayGroups.reduce((acc, day) => acc + day.items.length, 0);

  if (totalDistinctDays === 0) {
    return {
      pageIndex: 0,
      pageNumber: 0,
      totalPages: 0,
      windowSizeDays,
      totalDistinctDays: 0,
      totalLogsCount: 0,
      days: [],
      windowLogsCount: 0,
      windowTotalSeconds: 0,
      newestDateKey: null,
      oldestDateKey: null,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }

  const totalPages = Math.ceil(totalDistinctDays / windowSizeDays);
  const safeRequested = Number.isFinite(params.pageIndex) ? Math.floor(params.pageIndex) : 0;
  const clampedIndex = Math.min(Math.max(0, safeRequested), totalPages - 1);

  const start = clampedIndex * windowSizeDays;
  const days = params.dayGroups.slice(start, start + windowSizeDays);

  let windowLogsCount = 0;
  let windowTotalSeconds = 0;
  for (const day of days) {
    windowLogsCount += day.items.length;
    windowTotalSeconds += day.totalSeconds;
  }

  return {
    pageIndex: clampedIndex,
    pageNumber: clampedIndex + 1,
    totalPages,
    windowSizeDays,
    totalDistinctDays,
    totalLogsCount,
    days,
    windowLogsCount,
    windowTotalSeconds,
    newestDateKey: days[0]?.dateKey ?? null,
    oldestDateKey: days[days.length - 1]?.dateKey ?? null,
    hasPreviousPage: clampedIndex > 0,
    hasNextPage: clampedIndex < totalPages - 1,
  };
}

/**
 * Convenience composition: groups logs in `timeZone` and slices the requested 7-day window.
 */
export function paginateTrackerFeed(params: {
  logs: readonly TimeLog[];
  timeZone: string;
  pageIndex: number;
  windowSizeDays?: number;
}): TrackerFeedWindow {
  const dayGroups = groupLogsByCalendarDay(params.logs, params.timeZone);
  return sliceTrackerFeedWindow({
    dayGroups,
    pageIndex: params.pageIndex,
    windowSizeDays: params.windowSizeDays,
    totalLogsCount: params.logs.length,
  });
}

/**
 * Finds the 0-based pagination window index containing a specific YYYY-MM-DD `dateKey`.
 * Returns 0 if the dateKey is not found.
 */
export function findPageIndexForDateKey(
  dayGroups: readonly TrackerDayGroup[],
  dateKey: string,
  windowSizeDays: number = TRACKER_FEED_WINDOW_DAYS
): number {
  const size = Math.max(1, Math.floor(windowSizeDays));
  const idx = dayGroups.findIndex((g) => g.dateKey === dateKey);
  return idx >= 0 ? Math.floor(idx / size) : 0;
}
