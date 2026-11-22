import { describe, expect, it } from 'vitest';
import { toDateKey } from '../../app/domain/duration';
import {
  TRACKER_FEED_WINDOW_DAYS,
  findPageIndexForDateKey,
  groupLogsByCalendarDay,
  paginateTrackerFeed,
  resolveLogDateKey,
  sliceTrackerFeedWindow,
} from '../../app/domain/trackerFeed';
import type { TimeLog } from '../../app/domain/types';

function makeLog(overrides: Partial<TimeLog> & { id: string; startTime: string }): TimeLog {
  const durationSeconds = overrides.durationSeconds ?? 1800;
  const endTime =
    overrides.endTime ??
    new Date(Date.parse(overrides.startTime) + durationSeconds * 1000).toISOString();
  const timeZone = overrides.timeZone ?? 'UTC';
  const dateKey = overrides.dateKey ?? toDateKey(overrides.startTime, timeZone);

  return {
    id: overrides.id,
    userId: overrides.userId ?? 'u-test',
    description: overrides.description ?? `Task ${overrides.id}`,
    normalizedDescription: (overrides.description ?? `Task ${overrides.id}`).toLowerCase(),
    projectId: overrides.projectId ?? 'proj-1',
    projectNameSnapshot: overrides.projectNameSnapshot ?? 'Klox Core',
    projectColorSnapshot: overrides.projectColorSnapshot ?? '#3B82F6',
    tagIds: overrides.tagIds ?? [],
    tagNamesSnapshot: overrides.tagNamesSnapshot ?? [],
    isBillable: overrides.isBillable ?? true,
    startTime: overrides.startTime,
    endTime,
    durationSeconds,
    timeZone,
    dateKey,
  };
}

describe('domain/trackerFeed (NFR-1.1 7-Day Windowed Pagination)', () => {
  it('handles empty collections gracefully', () => {
    const win = paginateTrackerFeed({ logs: [], timeZone: 'UTC', pageIndex: 0 });
    expect(win.totalPages).toBe(0);
    expect(win.pageIndex).toBe(0);
    expect(win.pageNumber).toBe(0);
    expect(win.days).toEqual([]);
    expect(win.newestDateKey).toBeNull();
    expect(win.oldestDateKey).toBeNull();
    expect(win.hasPreviousPage).toBe(false);
    expect(win.hasNextPage).toBe(false);
    expect(win.windowLogsCount).toBe(0);
    expect(win.windowTotalSeconds).toBe(0);
  });

  it('chunks distinct calendar days into strictly 7-day windows descending and sorts intra-day items descending', () => {
    // 10 distinct calendar days (2026-11-01 through 2026-11-10), 2 logs per day
    const logs: TimeLog[] = [];
    for (let day = 1; day <= 10; day++) {
      const dd = String(day).padStart(2, '0');
      logs.push(
        makeLog({
          id: `d${dd}-morning`,
          startTime: `2026-11-${dd}T09:00:00.000Z`,
          durationSeconds: 3600,
        }),
        makeLog({
          id: `d${dd}-afternoon`,
          startTime: `2026-11-${dd}T15:00:00.000Z`,
          durationSeconds: 1800,
        })
      );
    }

    const dayGroups = groupLogsByCalendarDay(logs, 'UTC');
    expect(dayGroups).toHaveLength(10);

    // Page 0: 7 most recent distinct days (Nov 10 down to Nov 04)
    const page0 = sliceTrackerFeedWindow({ dayGroups, pageIndex: 0 });
    expect(page0.windowSizeDays).toBe(TRACKER_FEED_WINDOW_DAYS);
    expect(page0.totalPages).toBe(2);
    expect(page0.pageIndex).toBe(0);
    expect(page0.pageNumber).toBe(1);
    expect(page0.days).toHaveLength(7);
    expect(page0.newestDateKey).toBe('2026-11-10');
    expect(page0.oldestDateKey).toBe('2026-11-04');
    expect(page0.hasPreviousPage).toBe(false);
    expect(page0.hasNextPage).toBe(true);
    expect(page0.windowLogsCount).toBe(14);
    expect(page0.windowTotalSeconds).toBe(7 * 5400);

    // Intra-day ordering: afternoon (15:00) before morning (09:00)
    expect(page0.days[0]?.items.map((l) => l.id)).toEqual(['d10-afternoon', 'd10-morning']);

    // Page 1: remaining 3 days (Nov 03 down to Nov 01)
    const page1 = sliceTrackerFeedWindow({ dayGroups, pageIndex: 1 });
    expect(page1.pageIndex).toBe(1);
    expect(page1.pageNumber).toBe(2);
    expect(page1.days).toHaveLength(3);
    expect(page1.newestDateKey).toBe('2026-11-03');
    expect(page1.oldestDateKey).toBe('2026-11-01');
    expect(page1.hasPreviousPage).toBe(true);
    expect(page1.hasNextPage).toBe(false);
    expect(page1.windowLogsCount).toBe(6);
    expect(page1.windowTotalSeconds).toBe(3 * 5400);
  });

  it('recomputes calendar days (dateKey) dynamically in UserPreferences.timeZone', () => {
    // 2026-11-22T01:30:00Z is:
    // - 2026-11-22 in UTC
    // - 2026-11-21 22:30 in America/Sao_Paulo (UTC-3)
    // - 2026-11-22 10:30 in Asia/Tokyo (UTC+9)
    // 2026-11-22T20:00:00Z is:
    // - 2026-11-22 in UTC and America/Sao_Paulo
    // - 2026-11-23 05:00 in Asia/Tokyo
    const boundaryLogs: TimeLog[] = [
      makeLog({
        id: 'early-utc',
        startTime: '2026-11-22T01:30:00.000Z',
        timeZone: 'UTC',
        dateKey: '2026-11-22',
      }),
      makeLog({
        id: 'late-utc',
        startTime: '2026-11-22T20:00:00.000Z',
        timeZone: 'UTC',
        dateKey: '2026-11-22',
      }),
    ];

    expect(resolveLogDateKey(boundaryLogs[0]!, 'UTC')).toBe('2026-11-22');
    expect(resolveLogDateKey(boundaryLogs[0]!, 'America/Sao_Paulo')).toBe('2026-11-21');
    expect(resolveLogDateKey(boundaryLogs[1]!, 'Asia/Tokyo')).toBe('2026-11-23');

    const utcGroups = groupLogsByCalendarDay(boundaryLogs, 'UTC');
    expect(utcGroups.map((g) => g.dateKey)).toEqual(['2026-11-22']);

    const spGroups = groupLogsByCalendarDay(boundaryLogs, 'America/Sao_Paulo');
    expect(spGroups.map((g) => g.dateKey)).toEqual(['2026-11-22', '2026-11-21']);
    expect(spGroups[0]?.items.map((l) => l.id)).toEqual(['late-utc']);
    expect(spGroups[1]?.items.map((l) => l.id)).toEqual(['early-utc']);

    const tokyoGroups = groupLogsByCalendarDay(boundaryLogs, 'Asia/Tokyo');
    expect(tokyoGroups.map((g) => g.dateKey)).toEqual(['2026-11-23', '2026-11-22']);
    expect(tokyoGroups[0]?.items.map((l) => l.id)).toEqual(['late-utc']);
    expect(tokyoGroups[1]?.items.map((l) => l.id)).toEqual(['early-utc']);
  });

  it('clamps out-of-range pageIndex safely and locates pages by dateKey', () => {
    const logs = Array.from({ length: 14 }, (_, idx) => {
      const dd = String(idx + 1).padStart(2, '0');
      return makeLog({ id: `log-${dd}`, startTime: `2026-10-${dd}T12:00:00.000Z` });
    });

    const dayGroups = groupLogsByCalendarDay(logs, 'UTC');
    expect(sliceTrackerFeedWindow({ dayGroups, pageIndex: -5 }).pageIndex).toBe(0);
    expect(sliceTrackerFeedWindow({ dayGroups, pageIndex: 99 }).pageIndex).toBe(1);
    expect(sliceTrackerFeedWindow({ dayGroups, pageIndex: Number.NaN }).pageIndex).toBe(0);

    // 14 days descending: index 0..6 = Oct 14..Oct 08 (page 0); index 7..13 = Oct 07..Oct 01 (page 1)
    expect(findPageIndexForDateKey(dayGroups, '2026-10-14')).toBe(0);
    expect(findPageIndexForDateKey(dayGroups, '2026-10-08')).toBe(0);
    expect(findPageIndexForDateKey(dayGroups, '2026-10-07')).toBe(1);
    expect(findPageIndexForDateKey(dayGroups, '2026-10-01')).toBe(1);
    expect(findPageIndexForDateKey(dayGroups, '2020-01-01')).toBe(0);
  });

  it('handles sparse multi-year history without empty pages', () => {
    const sparseDates = [
      '2026-11-22',
      '2026-09-14',
      '2026-06-01',
      '2026-01-15',
      '2025-11-03',
      '2025-07-19',
      '2025-03-08',
      '2024-12-20',
      '2024-04-02',
    ];
    const logs = sparseDates.map((d, i) =>
      makeLog({ id: `sparse-${i}`, startTime: `${d}T14:00:00.000Z`, dateKey: d })
    );

    const p0 = paginateTrackerFeed({ logs, timeZone: 'UTC', pageIndex: 0 });
    expect(p0.totalPages).toBe(2);
    expect(p0.days.map((d) => d.dateKey)).toEqual(sparseDates.slice(0, 7));

    const p1 = paginateTrackerFeed({ logs, timeZone: 'UTC', pageIndex: 1 });
    expect(p1.days.map((d) => d.dateKey)).toEqual(sparseDates.slice(7));
  });

  it('paginates 3,500 multi-year TimeLogs into strictly bounded 7-day windows with instant latency', () => {
    // 500 distinct calendar days across ~2 years (2025-07 to 2026-11) * 7 logs/day = 3,500 logs
    const TOTAL_DAYS = 500;
    const LOGS_PER_DAY = 7;
    const TOTAL_LOGS = TOTAL_DAYS * LOGS_PER_DAY;
    const tz = 'America/Sao_Paulo';
    const baseMs = Date.parse('2026-11-22T12:00:00.000Z');
    const logs: TimeLog[] = [];

    for (let d = 0; d < TOTAL_DAYS; d++) {
      // Spread across ~2.3 years by spacing some days apart across months/years
      const dayOffset = d + Math.floor(d / 5);
      const dayBaseMs = baseMs - dayOffset * 86_400_000;
      const dateKey = toDateKey(new Date(dayBaseMs), tz);

      for (let j = 0; j < LOGS_PER_DAY; j++) {
        const startIso = new Date(dayBaseMs + j * 3_600_000).toISOString();
        logs.push(
          makeLog({
            id: `scale-${d}-${j}`,
            startTime: startIso,
            durationSeconds: 1800,
            timeZone: tz,
            dateKey,
          })
        );
      }
    }

    expect(logs).toHaveLength(TOTAL_LOGS);

    const groupStart = performance.now();
    const dayGroups = groupLogsByCalendarDay(logs, tz);
    const groupElapsedMs = performance.now() - groupStart;

    expect(dayGroups).toHaveLength(TOTAL_DAYS);
    expect(groupElapsedMs).toBeLessThan(150);

    const expectedPages = Math.ceil(TOTAL_DAYS / TRACKER_FEED_WINDOW_DAYS); // 72
    const seenDateKeys = new Set<string>();
    const seenLogIds = new Set<string>();
    let prevDateKey: string | null = null;

    const sliceStart = performance.now();
    for (let pageIdx = 0; pageIdx < expectedPages; pageIdx++) {
      const win = sliceTrackerFeedWindow({
        dayGroups,
        pageIndex: pageIdx,
        windowSizeDays: TRACKER_FEED_WINDOW_DAYS,
        totalLogsCount: logs.length,
      });

      expect(win.totalPages).toBe(expectedPages);
      expect(win.pageIndex).toBe(pageIdx);
      expect(win.pageNumber).toBe(pageIdx + 1);
      expect(win.hasPreviousPage).toBe(pageIdx > 0);
      expect(win.hasNextPage).toBe(pageIdx < expectedPages - 1);

      if (pageIdx < expectedPages - 1) {
        expect(win.days).toHaveLength(TRACKER_FEED_WINDOW_DAYS);
        expect(win.windowLogsCount).toBe(TRACKER_FEED_WINDOW_DAYS * LOGS_PER_DAY);
      } else {
        const remainderDays = TOTAL_DAYS % TRACKER_FEED_WINDOW_DAYS;
        expect(win.days).toHaveLength(remainderDays);
        expect(win.windowLogsCount).toBe(remainderDays * LOGS_PER_DAY);
      }

      for (const day of win.days) {
        if (prevDateKey !== null) {
          expect(day.dateKey < prevDateKey).toBe(true);
        }
        prevDateKey = day.dateKey;
        seenDateKeys.add(day.dateKey);
        for (const item of day.items) {
          seenLogIds.add(item.id);
        }
      }
    }
    const sliceElapsedMs = performance.now() - sliceStart;

    // Traversing all 72 pages must be virtually instantaneous
    expect(sliceElapsedMs).toBeLessThan(25);
    expect(seenDateKeys.size).toBe(TOTAL_DAYS);
    expect(seenLogIds.size).toBe(TOTAL_LOGS);
  });
});
