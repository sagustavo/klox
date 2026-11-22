import { toDateKey } from './duration';
import type { TimeLog } from './types';

export const TRACKER_FEED_WINDOW_DAYS = 7;

export interface TrackerDayGroup {
  dateKey: string; // "YYYY-MM-DD" computed in UserPreferences.timeZone
  totalSeconds: number;
  items: TimeLog[]; // Sorted descending by startTime
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
      });
    } else {
      existing.totalSeconds += log.durationSeconds;
      existing.items.push(log);
    }
  }

  const dayList = Array.from(groups.values());

  // Sort items within each day descending by startTime (newest first)
  for (const day of dayList) {
    if (day.items.length > 1) {
      day.items.sort((a, b) =>
        a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0
      );
    }
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
