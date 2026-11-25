import { describe, expect, it } from 'vitest';
import { mapFirebaseAuthErrorCode, tenantStorageKey } from '../../app/domain/auth';
import {
  aggregateDailyStacked,
  aggregatePizzaSlices,
  aggregateTimeSeriesStacked,
  extractDistinctDescriptionOptions,
  filterTimeLogs,
  formatTimeBucketLabel,
  groupLogsByTag,
  groupLogsTwoLevel,
  paginateItems,
} from '../../app/domain/aggregation';
import {
  doTimeRangesOverlap,
  elapsedSeconds,
  formatDynamicTabTitle,
  formatHMS,
  formatIdleTabTitle,
  normalizeDescription,
  parseHMS,
  parseTimeOfDay,
  resolveAdjustedTimerStartUtc,
  resolveTimeRange,
  shiftTimerStartByMinutes,
  toDateKey,
  toLocalTimeInputValue,
  zonedDateAndTimeToUtcIso,
} from '../../app/domain/duration';
import { deterministicLogId, generateRandomId } from '../../app/domain/ids';
import {
  applyProjectSwitch,
  buildTaskTree,
  collectDescendantTaskIds,
  createUnassignedProject,
  flattenTaskTree,
  formatTaskHierarchyLabel,
  isEmptyActiveTimer,
  resolveTagNames,
  tagsForProject,
  validateProjectTagRename,
  validateTaskParent,
} from '../../app/domain/invariants';
import { renderBasicMarkdown } from '../../app/domain/markdown';
import {
  applyDomainEventToOnboarding,
  createDefaultOnboardingState,
  getStarterProjectTemplates,
} from '../../app/domain/onboarding';
import { buildRecallTemplates, validateAiPrediction } from '../../app/domain/recall';
import {
  captureShortcutFromEvent,
  detectShortcutConflicts,
  formatShortcutKeycaps,
  isSingleKeyShortcut,
  matchesShortcutEvent,
  normalizeShortcutBinding,
  sanitizeShortcutOverrides,
} from '../../app/domain/shortcuts';
import {
  DEFAULT_SIDEBAR_STATE,
  SIDEBAR_STORAGE_KEY,
  cycleSidebarState,
  parseSidebarState,
  resolveReopenSidebarState,
} from '../../app/domain/sidebar';
import {
  TOGGL_CSV_HEADERS,
  createEmptyTogglPreviewFilters,
  filterTogglPreviewRows,
  parseAndPreviewTogglCsv,
  refreshTogglPreviewStatuses,
  serializeTogglCsv,
} from '../../app/domain/toggl';
import type { Project, ProjectTag, Task, TimeLog } from '../../app/domain/types';

describe('domain/duration', () => {
  it('calculates elapsedSeconds resiliently from UTC delta', () => {
    const start = '2026-11-09T05:00:00.000Z';
    const now = Date.parse('2026-11-09T06:01:05.900Z');
    expect(elapsedSeconds(start, now)).toBe(3665);
    expect(elapsedSeconds(start, Date.parse('2026-11-09T04:00:00.000Z'))).toBe(0);
    expect(elapsedSeconds('invalid-date', now)).toBe(0);
  });

  it('formats and parses HH:MM:SS losslessly', () => {
    expect(formatHMS(0)).toBe('00:00:00');
    expect(formatHMS(3665)).toBe('01:01:05');
    expect(formatHMS(360000)).toBe('100:00:00');
    expect(parseHMS('01:01:05')).toBe(3665);
    expect(parseHMS('100:00:00')).toBe(360000);
    expect(parseHMS('05:30')).toBe(330);
    expect(parseHMS('01:99:00')).toBeNull();
  });

  it('computes toDateKey in the user preferred IANA timezone across midnight boundaries', () => {
    // 2026-11-09 01:30 UTC is still 2026-11-08 22:30 in America/Sao_Paulo (UTC-3)
    const utc = '2026-11-09T01:30:00.000Z';
    expect(toDateKey(utc, 'UTC')).toBe('2026-11-09');
    expect(toDateKey(utc, 'America/Sao_Paulo')).toBe('2026-11-08');
    expect(toDateKey(utc, 'Asia/Tokyo')).toBe('2026-11-09');
  });

  it('normalizes descriptions consistently for recall templates', () => {
    expect(normalizeDescription('  Review   PR #42  ')).toBe('review pr #42');
  });

  it('resolves inline Start Time & Stop Time ranges in UserPreferences.timeZone and across midnight (FR-5.2)', () => {
    expect(parseTimeOfDay('09:30')).toEqual({ hours: 9, minutes: 30, seconds: 0 });
    expect(parseTimeOfDay('23:59:45')).toEqual({ hours: 23, minutes: 59, seconds: 45 });
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('12:60')).toBeNull();

    // America/Sao_Paulo is UTC-3 in Nov 2026: 09:15:10 -> 12:15:10Z, 10:45:25 -> 13:45:25Z
    const sameDay = resolveTimeRange({
      dateKey: '2026-11-22',
      startTimeInput: '09:15:10',
      endTimeInput: '10:45:25',
      timeZone: 'America/Sao_Paulo',
    });
    expect(sameDay).toEqual({
      startTimeUTC: '2026-11-22T12:15:10.000Z',
      endTimeUTC: '2026-11-22T13:45:25.000Z',
      durationSeconds: 5415, // 01:30:15
      spansNextDay: false,
    });
    expect(toLocalTimeInputValue(sameDay!.startTimeUTC, 'America/Sao_Paulo', true)).toBe(
      '09:15:10'
    );
    expect(toLocalTimeInputValue(sameDay!.endTimeUTC, 'America/Sao_Paulo', false)).toBe('10:45');

    // Overnight range (23:30 -> 00:15 rolls Stop Time onto 2026-11-23, yielding 45m = 2700s)
    const overnight = resolveTimeRange({
      dateKey: '2026-11-22',
      startTimeInput: '23:30',
      endTimeInput: '00:15',
      timeZone: 'UTC',
    });
    expect(overnight).toEqual({
      startTimeUTC: '2026-11-22T23:30:00.000Z',
      endTimeUTC: '2026-11-23T00:15:00.000Z',
      durationSeconds: 2700,
      spansNextDay: true,
    });

    // Identical start and stop times or invalid calendar dates return null
    expect(
      resolveTimeRange({
        dateKey: '2026-11-22',
        startTimeInput: '14:00',
        endTimeInput: '14:00',
        timeZone: 'UTC',
      })
    ).toBeNull();
    expect(zonedDateAndTimeToUtcIso('2026-02-30', '10:00', 'UTC')).toBeNull();
  });

  it('backdates and adjusts live ActiveTimer startTimeUTC while clamping future instants (FR-5.2)', () => {
    const nowMs = Date.parse('2026-11-22T18:00:00.000Z'); // 15:00 in America/Sao_Paulo
    const currentStart = '2026-11-22T17:55:00.000Z'; // 5m elapsed

    // Quick backdate "-15m": moves start 15m earlier -> 20m (1200s) elapsed
    const shifted15m = shiftTimerStartByMinutes(currentStart, -15, nowMs);
    expect(shifted15m).toBe('2026-11-22T17:40:00.000Z');
    expect(elapsedSeconds(shifted15m!, nowMs)).toBe(1200);

    // Positive shift exceeding nowMs clamps cleanly to nowMs (0s elapsed)
    const clampedShift = shiftTimerStartByMinutes(currentStart, 30, nowMs);
    expect(clampedShift).toBe('2026-11-22T18:00:00.000Z');
    expect(elapsedSeconds(clampedShift!, nowMs)).toBe(0);

    // Explicit local time input backdated to 14:30 America/Sao_Paulo (17:30Z -> 1800s elapsed)
    const explicitBackdate = resolveAdjustedTimerStartUtc({
      dateKey: '2026-11-22',
      startTimeInput: '14:30:00',
      timeZone: 'America/Sao_Paulo',
      nowMs,
    });
    expect(explicitBackdate).toEqual({
      startTimeUTC: '2026-11-22T17:30:00.000Z',
      elapsedSeconds: 1800,
      clampedToNow: false,
    });

    // Future local time input (16:00 America/Sao_Paulo = 19:00Z > 18:00Z) clamps to nowMs
    const futureAttempt = resolveAdjustedTimerStartUtc({
      dateKey: '2026-11-22',
      startTimeInput: '16:00:00',
      timeZone: 'America/Sao_Paulo',
      nowMs,
    });
    expect(futureAttempt).toEqual({
      startTimeUTC: '2026-11-22T18:00:00.000Z',
      elapsedSeconds: 0,
      clampedToNow: true,
    });
  });

  it('formats live H:MM:SS dynamic browser tab titles cleanly across edge cases (UX-2.1)', () => {
    // Sub-minute elapsed time (45s)
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 45,
        description: 'API Refactor',
        projectName: 'XP Core API',
      })
    ).toBe('0:00:45 | API Refactor | XP Core API • Klox');

    // Multi-hour (2h 20m 15s = 8415s) and whitespace normalization
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 8415,
        description: '  Review   architecture   RFC  ',
        projectName: '  Klox   Platform  ',
      })
    ).toBe('2:20:15 | Review architecture RFC | Klox Platform • Klox');

    // Exact 1h 02m 05s = 3725s
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 3725,
        description: 'Backend sync',
        projectName: 'Core',
      })
    ).toBe('1:02:05 | Backend sync | Core • Klox');

    // Unassigned fallback project omitted cleanly without extra separator
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 720,
        description: 'Deep Focus Session',
        projectName: 'General / Unassigned',
        isUnassignedProject: true,
      })
    ).toBe('0:12:00 | Deep Focus Session • Klox');

    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 720,
        description: 'Quick triage',
        projectName: '   ',
      })
    ).toBe('0:12:00 | Quick triage • Klox');

    // Long description truncated cleanly with ellipsis
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: 180,
        description: 'Implement comprehensive quarterly analytics export pipeline',
        projectName: 'Core',
        maxDescriptionLength: 24,
      })
    ).toBe('0:03:00 | Implement comprehensive… | Core • Klox');

    // Empty description + unassigned project + negative/NaN safety
    expect(
      formatDynamicTabTitle({
        elapsedSeconds: -10,
        description: '   ',
        isUnassignedProject: true,
      })
    ).toBe('0:00:00 • Klox');

    expect(
      formatDynamicTabTitle({
        elapsedSeconds: Number.NaN,
        description: '',
        projectName: null,
      })
    ).toBe('0:00:00 • Klox');

    // Idle workspace tab titles
    expect(formatIdleTabTitle('Tracker')).toBe('Tracker • Klox');
    expect(formatIdleTabTitle('Análises')).toBe('Análises • Klox');
    expect(formatIdleTabTitle('   ')).toBe('Klox');
  });
});

describe('domain/ids', () => {
  it('generates 20-char random alphanumeric IDs', () => {
    const a = generateRandomId();
    const b = generateRandomId();
    expect(a).toHaveLength(20);
    expect(b).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it('generates deterministic SHA-256 IDs for identical CSV import rows', async () => {
    const key = {
      startTimeUTC: '2026-11-09T12:00:00.000Z',
      durationSeconds: 1800,
      normalizedDescription: 'daily standup',
      projectName: 'XP Core API',
    };
    const id1 = await deterministicLogId(key);
    const id2 = await deterministicLogId({ ...key, projectName: '  xp core api ' });
    const id3 = await deterministicLogId({ ...key, durationSeconds: 1801 });

    expect(id1).toHaveLength(22);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});

describe('domain/invariants (Project-Scoped Tags)', () => {
  const projA: Project = {
    id: 'proj-a',
    userId: 'u1',
    name: 'XP Core API',
    color: '#3B82F6',
    isBillableDefault: true,
    createdAt: '2026-11-09T00:00:00.000Z',
  };
  const projB: Project = {
    id: 'proj-b',
    userId: 'u1',
    name: 'Marathon Prep',
    color: '#10B981',
    isBillableDefault: false,
    createdAt: '2026-11-09T00:00:00.000Z',
  };
  const tags: ProjectTag[] = [
    { id: 't1', userId: 'u1', projectId: 'proj-a', name: 'backend', createdAt: '' },
    { id: 't2', userId: 'u1', projectId: 'proj-a', name: 'security', createdAt: '' },
    { id: 't3', userId: 'u1', projectId: 'proj-b', name: 'cardio', createdAt: '' },
  ];

  it('returns only tags belonging to the selected project', () => {
    expect(tagsForProject(tags, 'proj-a').map((t) => t.id)).toEqual(['t1', 't2']);
    expect(tagsForProject(tags, 'proj-b').map((t) => t.id)).toEqual(['t3']);
    expect(tagsForProject(tags, null)).toEqual([]);
  });

  it('clears incompatible tags and resets isBillable on project switch', () => {
    const switched = applyProjectSwitch({
      nextProject: projB,
      currentTagIds: ['t1', 't3'],
      allTags: tags,
    });
    expect(switched.projectId).toBe('proj-b');
    expect(switched.tagIds).toEqual(['t3']);
    expect(switched.isBillable).toBe(false);
  });

  it('provisions fallback unassigned project with systemKey="unassigned"', () => {
    const unassigned = createUnassignedProject('u1');
    expect(unassigned.systemKey).toBe('unassigned');
    expect(unassigned.isBillableDefault).toBe(false);
  });

  it('deduplicates recall templates by normalizedDescription + projectId and ranks by frequency', () => {
    const logs: TimeLog[] = [
      {
        id: '1',
        userId: 'u1',
        description: 'Architect Core API',
        normalizedDescription: 'architect core api',
        projectId: 'proj-a',
        projectNameSnapshot: 'XP Core API',
        projectColorSnapshot: '#3B82F6',
        tagIds: ['t1'],
        isBillable: true,
        startTime: '2026-11-08T10:00:00.000Z',
        endTime: '2026-11-08T11:00:00.000Z',
        durationSeconds: 3600,
        timeZone: 'UTC',
        dateKey: '2026-11-08',
      },
      {
        id: '2',
        userId: 'u1',
        description: '  architect   core api ',
        normalizedDescription: 'architect core api',
        projectId: 'proj-a',
        projectNameSnapshot: 'XP Core API',
        projectColorSnapshot: '#3B82F6',
        tagIds: ['t1', 't2'],
        isBillable: true,
        startTime: '2026-11-09T10:00:00.000Z',
        endTime: '2026-11-09T11:00:00.000Z',
        durationSeconds: 3600,
        timeZone: 'UTC',
        dateKey: '2026-11-09',
      },
    ];

    const templates = buildRecallTemplates(logs);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.frequency).toBe(2);
    expect(templates[0]?.tagIds).toEqual(['t1', 't2']);
  });

  it('re-validates AI predictions on the server so cross-project tagIds are stripped', () => {
    const validated = validateAiPrediction({
      raw: {
        projectId: 'proj-a',
        tagIds: ['t1', 't3', 'hallucinated-tag'],
        isBillable: true,
      },
      projects: [projA, projB],
      tags,
    });
    expect(validated.projectId).toBe('proj-a');
    expect(validated.tagIds).toEqual(['t1']);
    expect(validated.isBillable).toBe(true);
  });

  it('validates ProjectTag renames (empty, length, missing, duplicate) and resolves tag names dynamically from tagIds', () => {
    expect(
      validateProjectTagRename({
        tagId: 't1',
        nextName: '   ',
        allTags: tags,
      })
    ).toEqual({ valid: false, normalizedName: '', error: 'TAG_NAME_EMPTY' });

    expect(
      validateProjectTagRename({
        tagId: 't1',
        nextName: 'x'.repeat(81),
        allTags: tags,
      }).error
    ).toBe('TAG_NAME_TOO_LONG');

    expect(
      validateProjectTagRename({
        tagId: 'missing',
        nextName: 'platform',
        allTags: tags,
      }).error
    ).toBe('TAG_NOT_FOUND');

    expect(
      validateProjectTagRename({
        tagId: 't1',
        nextName: '  SECURITY ',
        allTags: tags,
      }).error
    ).toBe('TAG_DUPLICATE_NAME');

    // Same name as tag in a DIFFERENT project is allowed (Project-Scoped Tag invariant)
    expect(
      validateProjectTagRename({
        tagId: 't1',
        nextName: '  cardio  ',
        allTags: tags,
      })
    ).toEqual({ valid: true, normalizedName: 'cardio' });

    expect(resolveTagNames(['t1', 'deleted-tag', 't3'], tags)).toEqual(['backend', 'cardio']);
  });
});

describe('domain/aggregation (Analytics Dashboard)', () => {
  const sampleTags: ProjectTag[] = [
    { id: 't1', userId: 'u1', projectId: 'proj-a', name: 'backend', createdAt: '' },
  ];

  const sampleLogs: TimeLog[] = [
    {
      id: 'l1',
      userId: 'u1',
      description: 'Core API Auth',
      normalizedDescription: 'core api auth',
      projectId: 'proj-a',
      projectNameSnapshot: 'XP Core API',
      projectColorSnapshot: '#3B82F6',
      tagIds: ['t1'],
      isBillable: true,
      startTime: '2026-11-09T10:00:00.000Z',
      endTime: '2026-11-09T11:00:00.000Z',
      durationSeconds: 3600,
      timeZone: 'UTC',
      dateKey: '2026-11-09',
    },
    {
      id: 'l2',
      userId: 'u1',
      description: 'Long Run',
      normalizedDescription: 'long run',
      projectId: 'proj-b',
      projectNameSnapshot: 'Marathon Prep',
      projectColorSnapshot: '#10B981',
      tagIds: [],
      isBillable: false,
      startTime: '2026-11-09T12:00:00.000Z',
      endTime: '2026-11-09T12:30:00.000Z',
      durationSeconds: 1800,
      timeZone: 'UTC',
      dateKey: '2026-11-09',
    },
  ];

  it('filters logs by projectId and slices Pizza chart by project or tag', () => {
    const filtered = filterTimeLogs({
      logs: sampleLogs,
      filters: {
        preset: 'all_time',
        projectIds: ['proj-a'],
        taskIds: [],
        tagIds: [],
        searchQuery: '',
      },
      timeZone: 'UTC',
      weekStartsOn: 1,
    });
    expect(filtered).toHaveLength(1);

    const pizza = aggregatePizzaSlices({
      logs: sampleLogs,
      dimension: 'project',
      tags: sampleTags,
    });
    expect(pizza.totalTrackedSeconds).toBe(5400);
    expect(pizza.slices).toHaveLength(2);

    const tagBuckets = groupLogsByTag(sampleLogs, 'Untagged', sampleTags);
    expect(tagBuckets.map((g) => g.tagLabel)).toEqual(['backend', 'Untagged']);
  });

  it('reflects renamed ProjectTag live across charts and grouped table without mutating TimeLogs or forcing # prefixes', () => {
    const renamedTags: ProjectTag[] = [
      { id: 't1', userId: 'u1', projectId: 'proj-a', name: 'api-core', createdAt: '' },
    ];

    const tagPizza = aggregatePizzaSlices({
      logs: sampleLogs,
      dimension: 'tag',
      untaggedLabel: 'Untagged',
      tags: renamedTags,
    });
    expect(tagPizza.slices.map((s) => s.label)).toEqual(['api-core', 'Untagged']);

    const tagStacked = aggregateDailyStacked({
      logs: sampleLogs,
      dimension: 'tag',
      bounds: { startDateKey: '2026-11-09', endDateKey: '2026-11-09' },
      untaggedLabel: 'Untagged',
      tags: renamedTags,
    });
    expect(tagStacked.series.map((s) => s.label)).toEqual(['api-core', 'Untagged']);

    const tagBuckets = groupLogsByTag(sampleLogs, 'Untagged', renamedTags);
    expect(tagBuckets.map((g) => g.tagLabel)).toEqual(['api-core', 'Untagged']);

    // Preserves literal '#' when the user explicitly enters it, while keeping plain tag names unprefixed
    const mixedPrefixTags: ProjectTag[] = [
      { id: 't1', userId: 'u1', projectId: 'proj-a', name: '#urgent', createdAt: '' },
    ];
    const literalHashSlices = aggregatePizzaSlices({
      logs: sampleLogs,
      dimension: 'tag',
      untaggedLabel: 'Untagged',
      tags: mixedPrefixTags,
    });
    expect(literalHashSlices.slices.map((s) => s.label)).toEqual(['#urgent', 'Untagged']);

    const literalPlainBuckets = groupLogsByTag(sampleLogs, 'Untagged', sampleTags);
    expect(literalPlainBuckets.map((g) => g.tagLabel)).toEqual(['backend', 'Untagged']);

    // Deleted tags are omitted cleanly and a log whose tags were all deleted falls back to Untagged
    const deletedTagsBuckets = groupLogsByTag(sampleLogs, 'Untagged', []);
    expect(deletedTagsBuckets.map((g) => g.tagLabel)).toEqual(['Untagged']);
    expect(deletedTagsBuckets[0]?.subtotalSeconds).toBe(5400);
  });

  it('supports 4-dimension slicing, 5 temporal granularities, 2-level grouping, 4 multi-select filters & pagination (FR-5.4 & FR-5.5)', () => {
    const projects: Project[] = [
      {
        id: 'proj-a',
        userId: 'u1',
        name: 'XP Core API',
        color: '#3B82F6',
        isBillableDefault: true,
        createdAt: '',
      },
      {
        id: 'proj-b',
        userId: 'u1',
        name: 'Marathon Prep',
        color: '#10B981',
        isBillableDefault: false,
        createdAt: '',
      },
    ];
    const tasks: Task[] = [
      {
        id: 'task-root',
        userId: 'u1',
        projectId: 'proj-a',
        depth: 0,
        name: 'Auth Service',
        completedWorkHours: 0,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'task-sub',
        userId: 'u1',
        projectId: 'proj-a',
        parentTaskId: 'task-root',
        depth: 1,
        name: 'JWT Guard',
        completedWorkHours: 0,
        status: 'in_progress',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    const tags: ProjectTag[] = [
      { id: 't1', userId: 'u1', projectId: 'proj-a', name: 'backend', createdAt: '' },
      { id: 't2', userId: 'u1', projectId: 'proj-a', name: 'security', createdAt: '' },
    ];

    const multiPeriodLogs: TimeLog[] = [
      {
        id: 'm1',
        userId: 'u1',
        description: 'Implement JWT',
        normalizedDescription: 'implement jwt',
        projectId: 'proj-a',
        projectNameSnapshot: 'XP Core API',
        projectColorSnapshot: '#3B82F6',
        taskId: 'task-sub',
        taskNameSnapshot: 'JWT Guard',
        tagIds: ['t1', 't2'],
        isBillable: true,
        startTime: '2026-01-12T10:00:00.000Z', // Monday Q1
        endTime: '2026-01-12T12:00:00.000Z',
        durationSeconds: 7200,
        timeZone: 'UTC',
        dateKey: '2026-01-12',
      },
      {
        id: 'm2',
        userId: 'u1',
        description: 'Implement JWT',
        normalizedDescription: 'implement jwt',
        projectId: 'proj-a',
        projectNameSnapshot: 'XP Core API',
        projectColorSnapshot: '#3B82F6',
        taskId: 'task-root',
        taskNameSnapshot: 'Auth Service',
        tagIds: ['t1'],
        isBillable: true,
        startTime: '2026-05-03T10:00:00.000Z', // Sunday Q2
        endTime: '2026-05-03T11:00:00.000Z',
        durationSeconds: 3600,
        timeZone: 'UTC',
        dateKey: '2026-05-03',
      },
      {
        id: 'm3',
        userId: 'u1',
        description: 'Tempo Run',
        normalizedDescription: 'tempo run',
        projectId: 'proj-b',
        projectNameSnapshot: 'Marathon Prep',
        projectColorSnapshot: '#10B981',
        tagIds: [],
        isBillable: false,
        startTime: '2026-05-04T07:00:00.000Z', // Monday Q2
        endTime: '2026-05-04T07:30:00.000Z',
        durationSeconds: 1800,
        timeZone: 'UTC',
        dateKey: '2026-05-04',
      },
    ];

    // 1. 4-multi-select filters combined (FR-5.5)
    const filtered = filterTimeLogs({
      logs: multiPeriodLogs,
      filters: {
        preset: 'all_time',
        projectIds: ['proj-a'],
        taskIds: ['task-sub'],
        tagIds: ['t2'],
        descriptions: ['implement jwt'],
        searchQuery: '',
      },
      timeZone: 'UTC',
      weekStartsOn: 1,
    });
    expect(filtered.map((l) => l.id)).toEqual(['m1']);

    // Distinct description options ordered by frequency desc
    const descOptions = extractDistinctDescriptionOptions(multiPeriodLogs);
    expect(descOptions.map((o) => [o.value, o.count])).toEqual([
      ['implement jwt', 2],
      ['tempo run', 1],
    ]);

    // 2. 4-Dimension Pizza Chart including hierarchical Task labels & 'No Task'
    const taskPizza = aggregatePizzaSlices({
      logs: multiPeriodLogs,
      dimension: 'task',
      noTaskLabel: 'No Task',
      projects,
      tasks,
      tags,
    });
    expect(taskPizza.slices.map((s) => [s.label, s.seconds])).toEqual([
      ['Auth Service / JWT Guard', 7200],
      ['Auth Service', 3600],
      ['No Task', 1800],
    ]);

    // 3. Temporal granularities: Week (respecting weekStartsOn: 0 vs 1), Month, Quarter, Year
    const weekSun = aggregateTimeSeriesStacked({
      logs: multiPeriodLogs.slice(1), // 2026-05-03 (Sun) & 2026-05-04 (Mon)
      dimension: 'project',
      granularity: 'week',
      bounds: { startDateKey: '2026-05-03', endDateKey: '2026-05-04' },
      weekStartsOn: 0, // Sunday starts the same week containing Sun May 03 & Mon May 04
      timeZone: 'UTC',
      projects,
    });
    expect(weekSun.bucketKeys).toEqual(['2026-05-03']);

    const weekMon = aggregateTimeSeriesStacked({
      logs: multiPeriodLogs.slice(1),
      dimension: 'project',
      granularity: 'week',
      bounds: { startDateKey: '2026-05-03', endDateKey: '2026-05-04' },
      weekStartsOn: 1, // Sunday May 03 falls in week 2026-04-27; Monday May 04 starts week 2026-05-04
      timeZone: 'UTC',
      projects,
    });
    expect(weekMon.bucketKeys).toEqual(['2026-04-27', '2026-05-04']);

    const quarterly = aggregateTimeSeriesStacked({
      logs: multiPeriodLogs,
      dimension: 'task',
      granularity: 'quarter',
      bounds: { startDateKey: '2026-01-01', endDateKey: '2026-06-30' },
      weekStartsOn: 1,
      timeZone: 'UTC',
      tasks,
    });
    expect(quarterly.bucketKeys).toEqual(['2026-Q1', '2026-Q2']);
    expect(formatTimeBucketLabel('2026-Q1', 'quarter', 'en')).toBe('2026 Q1');

    const yearly = aggregateTimeSeriesStacked({
      logs: multiPeriodLogs,
      dimension: 'description',
      granularity: 'year',
      bounds: { startDateKey: '2026-01-01', endDateKey: '2026-12-31' },
      weekStartsOn: 1,
      timeZone: 'UTC',
    });
    expect(yearly.bucketKeys).toEqual(['2026']);

    // 4. 2-Level Hierarchical Table Grouping (Project -> Tag)
    const twoLevel = groupLogsTwoLevel({
      logs: multiPeriodLogs,
      primaryDimension: 'project',
      secondaryDimension: 'tag',
      untaggedLabel: 'Untagged',
      projects,
      tasks,
      tags,
    });
    expect(twoLevel.map((g) => [g.label, g.subtotalSeconds])).toEqual([
      ['XP Core API', 10800],
      ['Marathon Prep', 1800],
    ]);
    expect(twoLevel[0]!.subgroups.map((s) => [s.label, s.subtotalSeconds])).toEqual([
      ['backend', 10800],
      ['security', 7200],
    ]);
    expect(twoLevel[1]!.subgroups.map((s) => [s.label, s.subtotalSeconds])).toEqual([
      ['Untagged', 1800],
    ]);

    // 5. Table Pagination across 1,000+ records
    const many = Array.from({ length: 1005 }, (_, i) => i + 1);
    const page0 = paginateItems({ items: many, pageIndex: 0, pageSize: 25 });
    expect(page0.totalPages).toBe(41);
    expect(page0.startItem).toBe(1);
    expect(page0.endItem).toBe(25);
    expect(page0.items).toHaveLength(25);

    const clampedLast = paginateItems({ items: many, pageIndex: 999, pageSize: 25 });
    expect(clampedLast.pageIndex).toBe(40);
    expect(clampedLast.startItem).toBe(1001);
    expect(clampedLast.endItem).toBe(1005);
    expect(clampedLast.items).toEqual([1001, 1002, 1003, 1004, 1005]);
  });
});

describe('domain/toggl (Bi-Directional Toggl CSV Studio)', () => {
  it('serializes TimeLogs with UTF-8 BOM + official English headers and round-trips idempotently', async () => {
    const catalogTags: ProjectTag[] = [
      { id: 't1', userId: 'u1', projectId: 'proj-a', name: 'architecture', createdAt: '' },
      { id: 't2', userId: 'u1', projectId: 'proj-a', name: 'security', createdAt: '' },
    ];

    const existingLog: TimeLog = {
      id: 'initial-id',
      userId: 'u1',
      description: 'Design Firestore security rules',
      normalizedDescription: 'design firestore security rules',
      projectId: 'proj-a',
      projectNameSnapshot: 'XP Core API',
      projectColorSnapshot: '#3B82F6',
      tagIds: ['t1', 't2'],
      isBillable: true,
      startTime: '2026-11-09T09:00:00.000Z',
      endTime: '2026-11-09T10:30:00.000Z',
      durationSeconds: 5400,
      timeZone: 'UTC',
      dateKey: '2026-11-09',
    };

    const csv = serializeTogglCsv({
      logs: [existingLog],
      userName: 'Gustavo',
      userEmail: 'gustavo@klox.dev',
      tags: catalogTags,
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(TOGGL_CSV_HEADERS.join(','));
    expect(csv).toContain('architecture, security');

    // Renaming a tag updates CSV exports automatically without touching TimeLogs
    const renamedExport = serializeTogglCsv({
      logs: [existingLog],
      userName: 'Gustavo',
      userEmail: 'gustavo@klox.dev',
      tags: [
        { ...catalogTags[0]!, name: 'system-architecture' },
        catalogTags[1]!,
      ],
    });
    expect(renamedExport).toContain('system-architecture, security');

    // First import against empty state -> 1 new log, 1 new project, 2 new scoped tags
    const firstPreview = await parseAndPreviewTogglCsv({
      csvText: csv,
      existingProjects: [],
      existingTags: [],
      existingLogs: [],
    });

    expect(firstPreview.errors).toHaveLength(0);
    expect(firstPreview.newLogsCount).toBe(1);
    expect(firstPreview.duplicateLogsCount).toBe(0);
    expect(firstPreview.newProjectNames).toEqual(['XP Core API']);
    expect(firstPreview.newScopedTags).toEqual([
      { projectName: 'XP Core API', tagName: 'architecture' },
      { projectName: 'XP Core API', tagName: 'security' },
    ]);

    // Second import against existing log -> 0 new logs, 1 duplicate skipped
    const secondPreview = await parseAndPreviewTogglCsv({
      csvText: csv,
      existingProjects: [
        {
          id: 'proj-a',
          userId: 'u1',
          name: 'XP Core API',
          color: '#3B82F6',
          isBillableDefault: true,
          createdAt: '',
        },
      ],
      existingTags: [],
      existingLogs: [
        {
          ...existingLog,
          id: firstPreview.logRows[0]!.deterministicId,
        },
      ],
    });

    expect(secondPreview.newLogsCount).toBe(0);
    expect(secondPreview.duplicateLogsCount).toBe(1);
  });
});

describe('domain/onboarding (DomainEvent Checklist & Localized Starter Templates)', () => {
  it('completes checklist items reactively when matching DomainEvents fire', () => {
    let state = createDefaultOnboardingState();
    expect(state.checklist.firstTimer).toBeUndefined();

    state = applyDomainEventToOnboarding(state, {
      type: 'TimerStopped',
      at: '2026-11-09T10:00:00.000Z',
    });
    expect(state.checklist.firstTimer).toBe('2026-11-09T10:00:00.000Z');

    state = applyDomainEventToOnboarding(state, {
      type: 'AiAutofillUsed',
      at: '2026-11-09T10:05:00.000Z',
    });
    expect(state.checklist.aiAutofill).toBe('2026-11-09T10:05:00.000Z');
  });

  it('returns localized starter project templates without any sample time logs', () => {
    const enWork = getStarterProjectTemplates('work', 'en');
    const ptBoth = getStarterProjectTemplates('both', 'pt-br');
    expect(enWork).toHaveLength(2);
    expect(ptBoth).toHaveLength(4);
    expect(ptBoth[0]?.tags.length).toBeGreaterThan(0);
  });
});

describe('domain/invariants & markdown (FR-4 Hierarchical Tasks & Markdown Descriptions)', () => {
  it('enforces 3-level hierarchy (Task -> Subtask -> Sub-subtask) and rejects depth > 2 or cross-project parenting', () => {
    const rootTask = {
      id: 't-root',
      userId: 'u1',
      projectId: 'p1',
      depth: 0 as const,
      name: 'Auth Module',
      completedWorkHours: 0,
      status: 'todo' as const,
      createdAt: '2026-11-09T01:00:00.000Z',
    };
    const subtask = {
      id: 't-sub',
      userId: 'u1',
      projectId: 'p1',
      parentTaskId: 't-root',
      depth: 1 as const,
      name: 'OAuth Flow',
      completedWorkHours: 0,
      status: 'todo' as const,
      createdAt: '2026-11-09T02:00:00.000Z',
    };
    const subSubtask = {
      id: 't-subsub',
      userId: 'u1',
      projectId: 'p1',
      parentTaskId: 't-sub',
      depth: 2 as const,
      name: 'Write unit tests',
      completedWorkHours: 0,
      status: 'todo' as const,
      createdAt: '2026-11-09T03:00:00.000Z',
    };

    const allTasks = [rootTask, subtask, subSubtask];

    expect(
      validateTaskParent({ projectId: 'p1', parentTaskId: 't-root', allTasks })
    ).toEqual({ valid: true, depth: 1 });
    expect(
      validateTaskParent({ projectId: 'p1', parentTaskId: 't-sub', allTasks })
    ).toEqual({ valid: true, depth: 2 });
    expect(
      validateTaskParent({ projectId: 'p1', parentTaskId: 't-subsub', allTasks }).valid
    ).toBe(false);
    expect(
      validateTaskParent({ projectId: 'p2', parentTaskId: 't-root', allTasks }).valid
    ).toBe(false);

    const flat = flattenTaskTree(buildTaskTree(allTasks, 'p1'));
    expect(flat.map((n) => [n.task.id, n.depth])).toEqual([
      ['t-root', 0],
      ['t-sub', 1],
      ['t-subsub', 2],
    ]);
    expect(formatTaskHierarchyLabel(subSubtask, allTasks)).toBe(
      'Auth Module / OAuth Flow / Write unit tests'
    );
    expect(collectDescendantTaskIds('t-root', allTasks)).toEqual([
      't-root',
      't-sub',
      't-subsub',
    ]);
  });

  it('renders basic Markdown safely while escaping raw HTML/XSS', () => {
    const html = renderBasicMarkdown(
      '# Title\n**bold** and `code` and <script>alert(1)</script>\n- [x] Done item\n- [ ] Todo item'
    );
    expect(html).toContain('<strong class="font-semibold text-text-primary">bold</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('☑');
    expect(html).toContain('☐');
  });
});

describe('domain/sidebar', () => {
  it('parses persisted sidebar state with safe expanded fallback and cycles across 3 modes (UX-2.3)', () => {
    expect(SIDEBAR_STORAGE_KEY).toBe('klox_sidebar_state');
    expect(DEFAULT_SIDEBAR_STATE).toBe('expanded');

    expect(parseSidebarState('expanded')).toBe('expanded');
    expect(parseSidebarState('collapsed')).toBe('collapsed');
    expect(parseSidebarState('hidden')).toBe('hidden');
    expect(parseSidebarState(null)).toBe('expanded');
    expect(parseSidebarState(undefined)).toBe('expanded');
    expect(parseSidebarState('invalid')).toBe('expanded');

    expect(cycleSidebarState('expanded')).toBe('collapsed');
    expect(cycleSidebarState('collapsed')).toBe('hidden');
    expect(cycleSidebarState('hidden')).toBe('expanded');

    expect(resolveReopenSidebarState('expanded')).toBe('expanded');
    expect(resolveReopenSidebarState('collapsed')).toBe('collapsed');
    expect(resolveReopenSidebarState(undefined)).toBe('expanded');
  });
});

describe('domain/auth', () => {
  it('maps Firebase Auth error codes to localized client error keys', () => {
    expect(mapFirebaseAuthErrorCode({ code: 'auth/invalid-credential' })).toBe(
      'AUTH_INVALID_CREDENTIALS'
    );
    expect(mapFirebaseAuthErrorCode({ code: 'auth/email-already-in-use' })).toBe(
      'AUTH_EMAIL_IN_USE'
    );
    expect(mapFirebaseAuthErrorCode({ code: 'auth/weak-password' })).toBe('AUTH_WEAK_PASSWORD');
    expect(mapFirebaseAuthErrorCode({ code: 'auth/popup-closed-by-user' })).toBe(
      'AUTH_POPUP_CLOSED'
    );
    expect(mapFirebaseAuthErrorCode({ code: 'auth/popup-blocked' })).toBe('AUTH_POPUP_BLOCKED');
    expect(mapFirebaseAuthErrorCode({ code: 'auth/unauthorized-domain' })).toBe(
      'AUTH_UNAUTHORIZED_DOMAIN'
    );
    expect(mapFirebaseAuthErrorCode({ code: 'auth/operation-not-allowed' })).toBe(
      'AUTH_PROVIDER_DISABLED'
    );
    expect(mapFirebaseAuthErrorCode({ code: 'auth/internal-error' })).toBe('AUTH_GENERIC_ERROR');
  });

  it('scopes localStorage keys cleanly by tenant uid', () => {
    const demoKey = tenantStorageKey('klox_catalog_projects', 'demo-user');
    const userKey = tenantStorageKey('klox_catalog_projects', 'firebase-uid-123');
    expect(demoKey).toBe('klox_catalog_projects:demo-user');
    expect(userKey).toBe('klox_catalog_projects:firebase-uid-123');
    expect(demoKey).not.toBe(userKey);
  });
});

describe('domain/toggl (NFR-1.2 High-Volume 3,500+ Row Parsing, Statuses & Column Filtering)', () => {
  it('parses 3,500 CSV rows in yieldable chunks, computes pending/imported statuses, filters by column, and paginates', async () => {
    const rowCount = 3500;
    const lines = [TOGGL_CSV_HEADERS.join(',')];
    for (let i = 0; i < rowCount; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      const project = i % 3 === 0 ? 'XP Core API' : i % 3 === 1 ? 'Klox Web' : '';
      const tags = i % 2 === 0 ? 'backend, review' : 'frontend';
      const duration = i % 5 === 0 ? '01:30:00' : '00:45:00';
      lines.push(
        `Gustavo,gustavo@klox.dev,,${project},,Task item #${i},Yes,2026-${month}-${day},09:00:00,2026-${month}-${day},09:45:00,${duration},"${tags}"`
      );
    }
    const csvText = lines.join('\n');
    const progressCalls: Array<{ processed: number; total: number }> = [];

    const firstPreview = await parseAndPreviewTogglCsv({
      csvText,
      existingProjects: [],
      existingTags: [],
      existingLogs: [],
      chunkSize: 500,
      onProgress: (processed, total) => progressCalls.push({ processed, total }),
    });

    expect(firstPreview.errors).toHaveLength(0);
    expect(firstPreview.logRows).toHaveLength(rowCount);
    expect(firstPreview.newLogsCount).toBe(rowCount);
    expect(firstPreview.duplicateLogsCount).toBe(0);
    expect(progressCalls.length).toBeGreaterThan(2);
    expect(progressCalls[progressCalls.length - 1]).toEqual({ processed: rowCount, total: rowCount });
    expect(firstPreview.logRows[0]?.importStatus).toBe('pending');

    // Simulate the first 100 rows already existing in TimeLogsStore -> refresh statuses in O(N)
    const existingLogs: TimeLog[] = firstPreview.logRows.slice(0, 100).map((r) => ({
      id: r.deterministicId,
      userId: 'u1',
      description: r.description,
      normalizedDescription: r.normalizedDescription,
      projectId: 'p1',
      projectNameSnapshot: r.projectName || 'General / Unassigned',
      projectColorSnapshot: '#3B82F6',
      tagIds: [],
      isBillable: r.isBillable,
      startTime: r.startTimeUTC,
      endTime: r.endTimeUTC,
      durationSeconds: r.durationSeconds,
      timeZone: 'UTC',
      dateKey: r.startDateKey,
    }));

    const refreshed = refreshTogglPreviewStatuses({
      preview: firstPreview,
      existingProjects: [],
      existingTags: [],
      existingLogs,
    });

    expect(refreshed.duplicateLogsCount).toBe(100);
    expect(refreshed.newLogsCount).toBe(rowCount - 100);
    expect(refreshed.logRows[0]?.importStatus).toBe('imported');
    expect(refreshed.logRows[100]?.importStatus).toBe('pending');

    // Filter by status + project + tag + duration + description + date
    const importedOnly = filterTogglPreviewRows(refreshed.logRows, {
      ...createEmptyTogglPreviewFilters(),
      status: 'imported',
    });
    expect(importedOnly).toHaveLength(100);

    const apiBackend90m = filterTogglPreviewRows(refreshed.logRows, {
      ...createEmptyTogglPreviewFilters(),
      projectQuery: 'xp core',
      tagQuery: 'review',
      durationQuery: '01:30',
      descriptionQuery: 'task item #30',
    });
    expect(apiBackend90m.some((r) => r.description === 'Task item #30')).toBe(true);
    expect(
      apiBackend90m.every(
        (r) =>
          r.projectName === 'XP Core API' &&
          r.tagNames.includes('review') &&
          r.durationSeconds === 5400
      )
    ).toBe(true);

    const unassignedFiltered = filterTogglPreviewRows(refreshed.logRows, {
      ...createEmptyTogglPreviewFilters(),
      projectQuery: 'Unassigned',
    });
    expect(unassignedFiltered.length).toBeGreaterThan(0);
    expect(unassignedFiltered.every((r) => r.projectName === '')).toBe(true);

    const paged = paginateItems({
      items: refreshed.logRows,
      pageIndex: 2,
      pageSize: 50,
    });
    expect(paged.items).toHaveLength(50);
    expect(paged.startItem).toBe(101);
    expect(paged.endItem).toBe(150);
    expect(paged.totalPages).toBe(70);
  });
});

describe('domain/invariants (FR-6.1 Empty ActiveTimer Discard Rule)', () => {
  it('marks an active timer empty only when description is blank, project is unassigned, and no task/tags are set', () => {
    expect(
      isEmptyActiveTimer({
        description: '',
        projectId: 'system_unassigned',
      })
    ).toBe(true);

    expect(
      isEmptyActiveTimer({
        description: '   ',
        projectId: null,
        taskId: null,
        tagIds: [],
      })
    ).toBe(true);

    expect(
      isEmptyActiveTimer({
        description: 'Write docs',
        projectId: 'system_unassigned',
      })
    ).toBe(false);

    expect(
      isEmptyActiveTimer({
        description: '',
        projectId: 'proj-123',
      })
    ).toBe(false);

    expect(
      isEmptyActiveTimer({
        description: '',
        projectId: 'system_unassigned',
        taskId: 'task-1',
      })
    ).toBe(false);

    expect(
      isEmptyActiveTimer({
        description: '',
        projectId: 'system_unassigned',
        tagIds: ['tag-1'],
      })
    ).toBe(false);
  });
});

describe('domain/shortcuts (FR-6.3 Customizable Keyboard Shortcuts & Conflict Detection)', () => {
  it('normalizes shortcut bindings, captures keyboard events, and matches platform combos cleanly', () => {
    expect(normalizeShortcutBinding('shift+mod+k')).toBe('Mod+Shift+K');
    expect(normalizeShortcutBinding('cmd+i')).toBe('Mod+I');
    expect(normalizeShortcutBinding('ctrl+alt+r')).toBe('Ctrl+Alt+R');
    expect(normalizeShortcutBinding('r')).toBe('R');
    expect(normalizeShortcutBinding('?')).toBe('?');
    expect(normalizeShortcutBinding('Escape')).toBeNull();
    expect(normalizeShortcutBinding('Tab')).toBeNull();
    expect(normalizeShortcutBinding('Shift')).toBeNull();

    // Capturing events collapses meta/ctrl into Mod and ignores Shift on plain '?'
    expect(captureShortcutFromEvent({ key: 'k', ctrlKey: true, shiftKey: true })).toBe('Mod+Shift+K');
    expect(captureShortcutFromEvent({ key: '?', shiftKey: true })).toBe('?');
    expect(captureShortcutFromEvent({ key: 'R', shiftKey: true })).toBe('Shift+R');
    expect(captureShortcutFromEvent({ key: 'Escape' })).toBeNull();

    // Matching single-key vs shifted vs Mod shortcuts
    expect(matchesShortcutEvent({ key: 'r' }, 'R')).toBe(true);
    expect(matchesShortcutEvent({ key: 'R', shiftKey: true }, 'R')).toBe(false);
    expect(matchesShortcutEvent({ key: 'R', shiftKey: true }, 'Shift+R')).toBe(true);
    expect(matchesShortcutEvent({ key: '?', shiftKey: true }, '?')).toBe(true);
    expect(matchesShortcutEvent({ key: 'i', metaKey: true }, 'Mod+I')).toBe(true);
    expect(matchesShortcutEvent({ key: 'i', ctrlKey: true }, 'Mod+I')).toBe(true);
    expect(matchesShortcutEvent({ key: 'IntlBackslash', code: 'Backslash', ctrlKey: true }, 'Mod+\\')).toBe(
      true
    );

    expect(isSingleKeyShortcut('R')).toBe(true);
    expect(isSingleKeyShortcut('Shift+R')).toBe(true);
    expect(isSingleKeyShortcut('?')).toBe(true);
    expect(isSingleKeyShortcut('Mod+I')).toBe(false);

    expect(formatShortcutKeycaps('Mod+Shift+K', true)).toEqual(['⌘', '⇧', 'K']);
    expect(formatShortcutKeycaps('Mod+Shift+K', false)).toEqual(['Ctrl', 'Shift', 'K']);
  });

  it('sanitizes overrides and detects colliding commands accurately', () => {
    const clean = sanitizeShortcutOverrides({
      'timer.new': 'n', // equals default -> omitted
      'timer.resumeLast': 'shift+r',
      'invalid.cmd': 'K',
      'timer.stop': 'Escape', // invalid -> omitted
    });
    expect(clean).toEqual({
      'timer.resumeLast': 'Shift+R',
    });

    const conflicts = detectShortcutConflicts({
      'timer.new': 'K',
      'timer.stop': 'S',
      'timer.resumeLast': 'K',
      'timer.aiAutofill': 'Mod+I',
      'ui.toggleSidebar': 'Mod+\\',
      'ui.toggleHelp': '?',
    });
    expect(conflicts['timer.new']).toEqual(['timer.resumeLast']);
    expect(conflicts['timer.resumeLast']).toEqual(['timer.new']);
    expect(conflicts['timer.stop']).toBeUndefined();
  });
});



