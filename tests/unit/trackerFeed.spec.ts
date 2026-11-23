import { describe, expect, it } from 'vitest';
import {
  doTimeRangesOverlap,
  formatHMS,
  normalizeDescription,
  resolveTimeRange,
  toDateKey,
} from '../../app/domain/duration';
import { applyProjectSwitch } from '../../app/domain/invariants';
import {
  INITIAL_TRACKER_STREAM_LIMIT,
  TRACKER_FEED_WINDOW_DAYS,
  TRACKER_STREAM_CHUNK_SIZE,
  areAllTrackerDaysExpanded,
  buildSameDayGroupSignature,
  defaultExpandedTrackerDayKeys,
  findPageIndexForDateKey,
  groupLogsByCalendarDay,
  groupSameDayEntries,
  mergeStreamedTimeLogsChunk,
  paginateTrackerFeed,
  resolveLogDateKey,
  sliceTrackerFeedWindow,
  toggleAllTrackerDayKeys,
} from '../../app/domain/trackerFeed';
import type { Project, ProjectTag, TimeLog } from '../../app/domain/types';

function makeLog(overrides: Partial<TimeLog> & { id: string; startTime: string }): TimeLog {
  const durationSeconds = overrides.durationSeconds ?? 1800;
  const endTime =
    overrides.endTime ??
    new Date(Date.parse(overrides.startTime) + durationSeconds * 1000).toISOString();
  const timeZone = overrides.timeZone ?? 'UTC';
  const dateKey = overrides.dateKey ?? toDateKey(overrides.startTime, timeZone);
  const description = overrides.description ?? `Task ${overrides.id}`;

  return {
    id: overrides.id,
    userId: overrides.userId ?? 'u-test',
    description,
    normalizedDescription: overrides.normalizedDescription ?? normalizeDescription(description),
    projectId: overrides.projectId ?? 'proj-1',
    projectNameSnapshot: overrides.projectNameSnapshot ?? 'Klox Core',
    projectColorSnapshot: overrides.projectColorSnapshot ?? '#3B82F6',
    ...(overrides.taskId !== undefined ? { taskId: overrides.taskId } : {}),
    ...(overrides.taskNameSnapshot !== undefined
      ? { taskNameSnapshot: overrides.taskNameSnapshot }
      : {}),
    tagIds: overrides.tagIds ?? [],
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

describe('domain/trackerFeed (FR-5.1 Same-Day Log Grouping & Accordion)', () => {
  it('collapses same-day logs with identical (normalizedDescription, projectId, taskId, tagIds) into a single summary group', () => {
    const logs: TimeLog[] = [
      makeLog({
        id: 'exec-1',
        description: '  implement   jwt auth ',
        projectId: 'proj-api',
        taskId: 'task-auth',
        taskNameSnapshot: 'Auth Middleware',
        tagIds: ['tag-sec', 'tag-be'],
        startTime: '2026-11-22T09:00:00.000Z',
        durationSeconds: 1805, // 00:30:05
        isBillable: false,
      }),
      makeLog({
        id: 'exec-2',
        description: 'Code review PR #42',
        projectId: 'proj-api',
        tagIds: ['tag-review'],
        startTime: '2026-11-22T11:00:00.000Z',
        durationSeconds: 900, // 00:15:00
        isBillable: true,
      }),
      makeLog({
        id: 'exec-3',
        description: 'Implement JWT Auth',
        projectId: 'proj-api',
        taskId: 'task-auth',
        taskNameSnapshot: 'Auth Middleware',
        tagIds: ['tag-be', 'tag-sec'], // reversed tag order must still match
        startTime: '2026-11-22T14:30:00.000Z',
        durationSeconds: 3655, // 01:00:55
        isBillable: true,
      }),
    ];

    const dayGroups = groupLogsByCalendarDay(logs, 'UTC');
    expect(dayGroups).toHaveLength(1);

    const day = dayGroups[0]!;
    expect(day.totalSeconds).toBe(1805 + 900 + 3655);
    expect(day.entryGroups).toHaveLength(2);

    // Group 0: newest execution was 14:30 ("Implement JWT Auth"), collapsed count = 2
    const authGroup = day.entryGroups[0]!;
    expect(authGroup.isGrouped).toBe(true);
    expect(authGroup.count).toBe(2);
    expect(authGroup.description).toBe('Implement JWT Auth');
    expect(authGroup.normalizedDescription).toBe('implement jwt auth');
    expect(authGroup.projectId).toBe('proj-api');
    expect(authGroup.taskId).toBe('task-auth');
    expect(authGroup.isBillable).toBe(true);
    expect(authGroup.totalSeconds).toBe(5460);
    expect(formatHMS(authGroup.totalSeconds)).toBe('01:31:00');
    expect(authGroup.earliestStartTime).toBe('2026-11-22T09:00:00.000Z');
    expect(authGroup.latestStartTime).toBe('2026-11-22T14:30:00.000Z');
    expect(authGroup.latestEndTime).toBe(
      new Date(Date.parse('2026-11-22T14:30:00.000Z') + 3655 * 1000).toISOString()
    );
    expect(authGroup.items.map((l) => l.id)).toEqual(['exec-3', 'exec-1']);

    // Group 1: singleton ("Code review PR #42"), count = 1, isGrouped = false
    const reviewGroup = day.entryGroups[1]!;
    expect(reviewGroup.isGrouped).toBe(false);
    expect(reviewGroup.count).toBe(1);
    expect(reviewGroup.totalSeconds).toBe(900);
    expect(formatHMS(reviewGroup.totalSeconds)).toBe('00:15:00');
    expect(reviewGroup.items.map((l) => l.id)).toEqual(['exec-2']);
  });

  it('keeps entries separate when description, projectId, taskId, or tagIds differ and avoids delimiter collisions', () => {
    const base = {
      startTime: '2026-11-22T10:00:00.000Z',
      description: 'Sync backlog',
      projectId: 'proj-1',
      taskId: 'task-1',
      tagIds: ['tag-1'],
    };

    const baseline = makeLog({ ...base, id: 'g-base' });
    const diffDesc = makeLog({ ...base, id: 'g-desc', description: 'Sync sprint' });
    const diffProj = makeLog({ ...base, id: 'g-proj', projectId: 'proj-2' });
    const diffTask = makeLog({ ...base, id: 'g-task', taskId: 'task-2' });
    const noTask = makeLog({
      id: 'g-notask',
      startTime: base.startTime,
      description: base.description,
      projectId: base.projectId,
      tagIds: base.tagIds,
    });
    const diffTags = makeLog({ ...base, id: 'g-tags', tagIds: ['tag-1', 'tag-2'] });

    const groups = groupSameDayEntries(
      [baseline, diffDesc, diffProj, diffTask, noTask, diffTags],
      '2026-11-22'
    );
    expect(groups).toHaveLength(6);
    expect(groups.every((g) => !g.isGrouped && g.count === 1)).toBe(true);

    // Length-prefixed encoding prevents delimiter injection collisions
    const trickyA = makeLog({
      id: 'tricky-a',
      startTime: '2026-11-22T10:00:00.000Z',
      description: 'alpha|4:beta',
      projectId: 'p1',
    });
    const trickyB = makeLog({
      id: 'tricky-b',
      startTime: '2026-11-22T11:00:00.000Z',
      description: 'alpha',
      projectId: 'beta|2:p1',
    });
    expect(buildSameDayGroupSignature(trickyA)).not.toBe(buildSameDayGroupSignature(trickyB));
  });

  it('never groups identical metadata across distinct calendar days (dateKey)', () => {
    const day1 = makeLog({
      id: 'd1',
      description: 'Daily workout',
      projectId: 'proj-health',
      tagIds: ['cardio'],
      startTime: '2026-11-21T18:00:00.000Z',
      durationSeconds: 2700,
    });
    const day2 = makeLog({
      id: 'd2',
      description: 'Daily workout',
      projectId: 'proj-health',
      tagIds: ['cardio'],
      startTime: '2026-11-22T18:00:00.000Z',
      durationSeconds: 2700,
    });

    const dayGroups = groupLogsByCalendarDay([day1, day2], 'UTC');
    expect(dayGroups).toHaveLength(2);
    expect(dayGroups[0]?.entryGroups).toHaveLength(1);
    expect(dayGroups[0]?.entryGroups[0]?.isGrouped).toBe(false);
    expect(dayGroups[1]?.entryGroups).toHaveLength(1);
    expect(dayGroups[1]?.entryGroups[0]?.isGrouped).toBe(false);
    expect(dayGroups[0]?.entryGroups[0]?.groupKey).not.toBe(
      dayGroups[1]?.entryGroups[0]?.groupKey
    );
  });

  it('preserves groupKey on sub-item duration edit, splits on metadata edit, and ungroups/removes cleanly on delete', () => {
    const itemA = makeLog({
      id: 'a',
      description: 'Architecture ADR',
      projectId: 'proj-cap',
      tagIds: ['docs'],
      startTime: '2026-11-22T08:00:00.000Z',
      durationSeconds: 1200,
    });
    const itemB = makeLog({
      id: 'b',
      description: 'Architecture ADR',
      projectId: 'proj-cap',
      tagIds: ['docs'],
      startTime: '2026-11-22T10:00:00.000Z',
      durationSeconds: 1800,
    });
    const itemC = makeLog({
      id: 'c',
      description: 'Architecture ADR',
      projectId: 'proj-cap',
      tagIds: ['docs'],
      startTime: '2026-11-22T13:00:00.000Z',
      durationSeconds: 600,
    });

    const initial = groupLogsByCalendarDay([itemA, itemB, itemC], 'UTC')[0]!;
    expect(initial.entryGroups).toHaveLength(1);
    const initialGroupKey = initial.entryGroups[0]!.groupKey;
    expect(initial.entryGroups[0]!.count).toBe(3);
    expect(initial.entryGroups[0]!.totalSeconds).toBe(3600);

    // 1. Inline duration edit on sub-item B: groupKey stays stable (accordion stays open), totalSeconds updates
    const editedDurationB: TimeLog = { ...itemB, durationSeconds: 2400 };
    const afterDurationEdit = groupLogsByCalendarDay([itemA, editedDurationB, itemC], 'UTC')[0]!;
    expect(afterDurationEdit.entryGroups).toHaveLength(1);
    expect(afterDurationEdit.entryGroups[0]!.groupKey).toBe(initialGroupKey);
    expect(afterDurationEdit.entryGroups[0]!.totalSeconds).toBe(4200);
    expect(formatHMS(afterDurationEdit.entryGroups[0]!.totalSeconds)).toBe('01:10:00');

    // 2. Inline metadata edit on sub-item C (description changed): C splits out, A + B remain grouped (count = 2)
    const editedMetaC: TimeLog = {
      ...itemC,
      description: 'C4 Diagram Polish',
      normalizedDescription: 'c4 diagram polish',
    };
    const afterMetaEdit = groupLogsByCalendarDay([itemA, editedDurationB, editedMetaC], 'UTC')[0]!;
    expect(afterMetaEdit.entryGroups).toHaveLength(2);
    expect(afterMetaEdit.entryGroups[0]!.description).toBe('C4 Diagram Polish');
    expect(afterMetaEdit.entryGroups[0]!.isGrouped).toBe(false);
    expect(afterMetaEdit.entryGroups[1]!.groupKey).toBe(initialGroupKey);
    expect(afterMetaEdit.entryGroups[1]!.count).toBe(2);
    expect(afterMetaEdit.entryGroups[1]!.isGrouped).toBe(true);
    expect(afterMetaEdit.entryGroups[1]!.totalSeconds).toBe(3600);

    // 3. Delete sub-item B: remaining item A automatically ungroups to standalone row (count = 1, isGrouped = false)
    const afterSingleDelete = groupLogsByCalendarDay([itemA, editedMetaC], 'UTC')[0]!;
    const remainingAdrGroup = afterSingleDelete.entryGroups.find((g) => g.items[0]?.id === 'a')!;
    expect(remainingAdrGroup.count).toBe(1);
    expect(remainingAdrGroup.isGrouped).toBe(false);
    expect(remainingAdrGroup.totalSeconds).toBe(1200);

    // 4. Cascade delete all IDs belonging to a group removes the group completely
    const groupIdsToDelete = new Set(initial.entryGroups[0]!.items.map((i) => i.id));
    const remainingLogs = [itemA, itemB, itemC, editedMetaC].filter(
      (l) => !groupIdsToDelete.has(l.id)
    );
    expect(remainingLogs).toHaveLength(0);
    expect(groupLogsByCalendarDay(remainingLogs, 'UTC')).toEqual([]);
  });

  it('permits overlapping manual TimeLogs and orders identical-start intervals deterministically (FR-5.2)', () => {
    const rangeExisting = resolveTimeRange({
      dateKey: '2026-11-22',
      startTimeInput: '09:00',
      endTimeInput: '10:30',
      timeZone: 'UTC',
    })!;
    const rangePartialOverlap = resolveTimeRange({
      dateKey: '2026-11-22',
      startTimeInput: '09:45',
      endTimeInput: '11:00',
      timeZone: 'UTC',
    })!;
    const rangeExactStartOverlap = resolveTimeRange({
      dateKey: '2026-11-22',
      startTimeInput: '09:00',
      endTimeInput: '11:30',
      timeZone: 'UTC',
    })!;

    const logExisting = makeLog({
      id: 'ov-1',
      description: 'Sprint Planning Call',
      projectId: 'proj-work',
      startTime: rangeExisting.startTimeUTC,
      endTime: rangeExisting.endTimeUTC,
      durationSeconds: rangeExisting.durationSeconds,
    });
    const logPartial = makeLog({
      id: 'ov-2',
      description: 'Hotfix Triage',
      projectId: 'proj-ops',
      startTime: rangePartialOverlap.startTimeUTC,
      endTime: rangePartialOverlap.endTimeUTC,
      durationSeconds: rangePartialOverlap.durationSeconds,
    });
    const logSameStart = makeLog({
      id: 'ov-3',
      description: 'Incident Bridge Monitoring',
      projectId: 'proj-ops',
      startTime: rangeExactStartOverlap.startTimeUTC,
      endTime: rangeExactStartOverlap.endTimeUTC,
      durationSeconds: rangeExactStartOverlap.durationSeconds,
    });

    expect(doTimeRangesOverlap(logExisting, logPartial)).toBe(true);
    expect(doTimeRangesOverlap(logExisting, logSameStart)).toBe(true);

    const day = groupLogsByCalendarDay([logExisting, logPartial, logSameStart], 'UTC')[0]!;
    // All 3 overlapping entries are preserved and summed in the daily feed
    expect(day.items.map((l) => l.id)).toEqual(['ov-2', 'ov-3', 'ov-1']);
    expect(day.entryGroups).toHaveLength(3);
    expect(day.totalSeconds).toBe(5400 + 4500 + 9000);
  });

  it('tracks allBillable vs partial billable state and preserves cohesive groups across bulk metadata edits (FR-5.2)', () => {
    const first = makeLog({
      id: 'bulk-1',
      description: 'API Contract Design',
      projectId: 'proj-a',
      tagIds: ['tag-a1', 'tag-a2'],
      isBillable: false,
      startTime: '2026-11-22T09:00:00.000Z',
      durationSeconds: 1800,
    });
    const second = makeLog({
      id: 'bulk-2',
      description: 'API Contract Design',
      projectId: 'proj-a',
      tagIds: ['tag-a1', 'tag-a2'],
      isBillable: false,
      startTime: '2026-11-22T11:00:00.000Z',
      durationSeconds: 2400,
    });

    // 1. Both non-billable -> isBillable=false, allBillable=false (hover-reveal $ icon on group header)
    const nonBillableGroup = groupLogsByCalendarDay([first, second], 'UTC')[0]!.entryGroups[0]!;
    expect(nonBillableGroup.isBillable).toBe(false);
    expect(nonBillableGroup.allBillable).toBe(false);

    // 2. Mixed billable/non-billable -> isBillable=true, allBillable=false (toggling !allBillable marks all true)
    const mixedGroup = groupLogsByCalendarDay(
      [first, { ...second, isBillable: true }],
      'UTC'
    )[0]!.entryGroups[0]!;
    expect(mixedGroup.isBillable).toBe(true);
    expect(mixedGroup.allBillable).toBe(false);

    // 3. Bulk toggle to !allBillable (true) -> allBillable=true
    const allTrueGroup = groupLogsByCalendarDay(
      [
        { ...first, isBillable: true },
        { ...second, isBillable: true },
      ],
      'UTC'
    )[0]!.entryGroups[0]!;
    expect(allTrueGroup.isBillable).toBe(true);
    expect(allTrueGroup.allBillable).toBe(true);

    // 4. Bulk project switch enforces Project-Scoped Tag invariant and migrates groupKey deterministically
    const nextProject: Project = {
      id: 'proj-b',
      userId: 'u-test',
      name: 'Platform Infra',
      color: '#10B981',
      isBillableDefault: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const allTags: ProjectTag[] = [
      { id: 'tag-a1', userId: 'u-test', projectId: 'proj-a', name: 'backend', createdAt: '' },
      { id: 'tag-b1', userId: 'u-test', projectId: 'proj-b', name: 'terraform', createdAt: '' },
    ];
    const switched = applyProjectSwitch({
      nextProject,
      currentTagIds: nonBillableGroup.tagIds,
      allTags,
    });
    expect(switched.tagIds).toEqual([]);
    expect(switched.isBillable).toBe(true);

    const bulkUpdatedLogs = [first, second].map((log) => ({
      ...log,
      projectId: switched.projectId,
      tagIds: switched.tagIds,
      isBillable: switched.isBillable,
    }));
    const regrouped = groupLogsByCalendarDay(bulkUpdatedLogs, 'UTC')[0]!.entryGroups;
    expect(regrouped).toHaveLength(1);
    expect(regrouped[0]!.count).toBe(2);
    expect(regrouped[0]!.projectId).toBe('proj-b');
    expect(regrouped[0]!.allBillable).toBe(true);
    expect(regrouped[0]!.groupKey).toBe(
      `2026-11-22|${buildSameDayGroupSignature(bulkUpdatedLogs[0]!)}`
    );
  });
});

describe('domain/trackerFeed (Day-Level Accordion & Expand/Collapse All)', () => {
  it('handles empty windows cleanly', () => {
    expect(defaultExpandedTrackerDayKeys([])).toEqual([]);
    expect(areAllTrackerDaysExpanded([], [])).toBe(false);
    expect(areAllTrackerDaysExpanded([], ['2026-11-22'])).toBe(false);
    expect(toggleAllTrackerDayKeys([], [])).toEqual([]);
  });

  it('expands only the most recent day by default and toggles expand/collapse all across displayed days', () => {
    const days = [
      { dateKey: '2026-11-22' },
      { dateKey: '2026-11-21' },
      { dateKey: '2026-11-20' },
    ];

    const initial = defaultExpandedTrackerDayKeys(days);
    expect(initial).toEqual(['2026-11-22']);
    expect(areAllTrackerDaysExpanded(days, initial)).toBe(false);

    // Single-day window has all visible days expanded by default
    expect(areAllTrackerDaysExpanded([days[0]!], initial)).toBe(true);

    // Partial expansion is still not all-expanded
    expect(areAllTrackerDaysExpanded(days, ['2026-11-22', '2026-11-20'])).toBe(false);

    // Toggling from partial/default state expands all days in the current window
    const allExpanded = toggleAllTrackerDayKeys(days, initial);
    expect(allExpanded).toEqual(['2026-11-22', '2026-11-21', '2026-11-20']);
    expect(areAllTrackerDaysExpanded(days, allExpanded)).toBe(true);

    // Toggling when all days are expanded collapses every day
    const allCollapsed = toggleAllTrackerDayKeys(days, allExpanded);
    expect(allCollapsed).toEqual([]);
    expect(areAllTrackerDaysExpanded(days, allCollapsed)).toBe(false);

    // Toggling from fully collapsed expands all days again
    expect(toggleAllTrackerDayKeys(days, allCollapsed)).toEqual([
      '2026-11-22',
      '2026-11-21',
      '2026-11-20',
    ]);
  });
});

describe('domain/trackerFeed (Progressive Stream Chunk Merging)', () => {
  it('merges chunks progressively, deduplicates IDs, and preserves concurrent local mutations', () => {
    expect(INITIAL_TRACKER_STREAM_LIMIT).toBe(100);
    expect(TRACKER_STREAM_CHUNK_SIZE).toBe(500);

    const logNewest = makeLog({ id: 'log-3', startTime: '2026-11-22T15:00:00.000Z' });
    const logMiddle = makeLog({ id: 'log-2', startTime: '2026-11-21T12:00:00.000Z' });
    const logOldest = makeLog({ id: 'log-1', startTime: '2026-11-20T09:00:00.000Z' });

    // 1. Initial chunk arrives
    const first = mergeStreamedTimeLogsChunk({
      accumulatedRemote: [],
      incomingChunk: [logNewest, logMiddle],
      upsertedById: new Map(),
      deletedIds: new Set(),
    });
    expect(first.mergedLogs.map((l) => l.id)).toEqual(['log-3', 'log-2']);

    // 2. While background chunks stream, user creates 'log-new', edits 'log-2', and deletes 'log-3'
    const localNew = makeLog({
      id: 'log-new',
      description: 'New live entry',
      startTime: '2026-11-22T18:00:00.000Z',
    });
    const editedMiddle = makeLog({
      id: 'log-2',
      description: 'Updated title',
      startTime: '2026-11-21T12:00:00.000Z',
    });
    const upsertedById = new Map<string, TimeLog>([
      ['log-new', localNew],
      ['log-2', editedMiddle],
    ]);
    const deletedIds = new Set<string>(['log-3']);

    // 3. Second chunk arrives containing an overlapping duplicate of 'log-2' and older 'log-1'
    const second = mergeStreamedTimeLogsChunk({
      accumulatedRemote: first.nextAccumulatedRemote,
      incomingChunk: [logMiddle, logOldest],
      upsertedById,
      deletedIds,
    });

    expect(second.mergedLogs.map((l) => l.id)).toEqual(['log-new', 'log-2', 'log-1']);
    expect(second.mergedLogs.find((l) => l.id === 'log-2')?.description).toBe('Updated title');
    expect(second.mergedLogs.find((l) => l.id === 'log-3')).toBeUndefined();
  });
});

