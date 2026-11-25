import { describe, expect, it } from 'vitest';
import {
  buildActivityHeatmap,
  computeHeatmapIntensityLevel,
  extractAvailableHeatmapYears,
} from '../../app/domain/heatmap';
import {
  getUserInitials,
  isValidAvatarDataUrl,
  normalizeDisplayName,
  normalizeUsername,
  resolveEffectiveAvatarUrl,
  validateAvatarFileMeta,
  validateDisplayName,
  validateUsername,
} from '../../app/domain/profile';
import { parseAndPreviewTogglCsv, serializeTogglCsv } from '../../app/domain/toggl';
import type { Project, ProjectTag, Task, TimeLog } from '../../app/domain/types';

function makeLog(overrides: Partial<TimeLog> & { id: string; startTime: string; durationSeconds: number }): TimeLog {
  const startMs = Date.parse(overrides.startTime);
  const endTime = overrides.endTime ?? new Date(startMs + overrides.durationSeconds * 1000).toISOString();
  return {
    userId: 'u1',
    description: 'Deep Focus',
    normalizedDescription: 'deep focus',
    projectId: 'proj-a',
    projectNameSnapshot: 'XP Core API',
    projectColorSnapshot: '#3B82F6',
    tagIds: [],
    isBillable: true,
    endTime,
    timeZone: 'UTC',
    dateKey: overrides.startTime.slice(0, 10),
    ...overrides,
  };
}

describe('domain/profile (FR-6.6 Identity, Unique Username & Avatar Validation)', () => {
  it('normalizes and validates display names cleanly', () => {
    expect(normalizeDisplayName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(validateDisplayName('  Ada   Lovelace  ')).toEqual({
      valid: true,
      normalized: 'Ada Lovelace',
    });
    expect(validateDisplayName('   ')).toEqual({
      valid: false,
      normalized: '',
      error: 'DISPLAY_NAME_EMPTY',
    });
    expect(validateDisplayName('x'.repeat(81)).error).toBe('DISPLAY_NAME_TOO_LONG');
  });

  it('validates unique usernames, strips @, rejects reserved handles and invalid syntax', () => {
    expect(normalizeUsername('  @Gustavo_Dev  ')).toBe('gustavo_dev');
    expect(validateUsername('@Gustavo_Dev')).toEqual({
      valid: true,
      normalized: 'gustavo_dev',
    });
    expect(validateUsername('klox-user-01').valid).toBe(true);
    expect(validateUsername('', { allowEmpty: true })).toEqual({
      valid: true,
      normalized: '',
    });

    expect(validateUsername('ab').error).toBe('USERNAME_TOO_SHORT');
    expect(validateUsername('a'.repeat(25)).error).toBe('USERNAME_TOO_LONG');
    expect(validateUsername('_gustavo').error).toBe('USERNAME_INVALID_CHARS');
    expect(validateUsername('gustavo-').error).toBe('USERNAME_INVALID_CHARS');
    expect(validateUsername('gus.tavo').error).toBe('USERNAME_INVALID_CHARS');
    expect(validateUsername('gus--tavo').error).toBe('USERNAME_CONSECUTIVE_SEPARATORS');
    expect(validateUsername('gus_-tavo').error).toBe('USERNAME_CONSECUTIVE_SEPARATORS');
    expect(validateUsername('admin').error).toBe('USERNAME_RESERVED');
    expect(validateUsername('klox').error).toBe('USERNAME_RESERVED');
  });

  it('enforces avatar precedence (custom > Google photoURL > null) and initials fallback', () => {
    const custom = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const google = 'https://lh3.googleusercontent.com/a/example-photo';

    expect(
      resolveEffectiveAvatarUrl({ customAvatarUrl: custom, googlePhotoUrl: google })
    ).toBe(custom);
    expect(
      resolveEffectiveAvatarUrl({ customAvatarUrl: null, googlePhotoUrl: google })
    ).toBe(google);
    expect(
      resolveEffectiveAvatarUrl({ customAvatarUrl: null, googlePhotoUrl: null })
    ).toBeNull();

    expect(getUserInitials('Ada Lovelace', 'ada@klox.dev')).toBe('AL');
    expect(getUserInitials('Gustavo', 'gustavo@klox.dev')).toBe('G');
    expect(getUserInitials('', 'gustavo@klox.dev')).toBe('G');
    expect(getUserInitials('', '')).toBe('K');
  });

  it('rejects SVG, oversized avatar files, and unsafe data URIs', () => {
    expect(validateAvatarFileMeta({ type: 'image/png', size: 1024 }).valid).toBe(true);
    expect(validateAvatarFileMeta({ type: 'image/webp', size: 1024 }).valid).toBe(true);
    expect(validateAvatarFileMeta({ type: 'image/svg+xml', size: 512 }).error).toBe(
      'AVATAR_UNSUPPORTED_TYPE'
    );
    expect(validateAvatarFileMeta({ type: 'image/jpeg', size: 6 * 1024 * 1024 }).error).toBe(
      'AVATAR_FILE_TOO_LARGE'
    );

    expect(
      isValidAvatarDataUrl('data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ')
    ).toBe(true);
    expect(
      isValidAvatarDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/')
    ).toBe(true);
    expect(isValidAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(isValidAvatarDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(
      isValidAvatarDataUrl(`data:image/webp;base64,${'A'.repeat(130_000)}`)
    ).toBe(false);
  });
});

describe('domain/heatmap (FR-6.6 Year-at-a-Glance Activity Heatmap)', () => {
  it('buckets logs in UserPreferences.timeZone across midnight and respects weekStartsOn', () => {
    // 2026-11-09T01:30:00Z is 2026-11-08 22:30 in America/Sao_Paulo (Sunday)
    const midnightBoundaryLog = makeLog({
      id: 'tz-1',
      startTime: '2026-11-09T01:30:00.000Z',
      durationSeconds: 3600,
      timeZone: 'UTC',
      dateKey: '2026-11-09',
    });

    const now = new Date('2026-11-25T15:00:00.000Z');
    const spHeatmap = buildActivityHeatmap({
      logs: [midnightBoundaryLog],
      timeZone: 'America/Sao_Paulo',
      weekStartsOn: 1, // Monday first
      range: 2026,
      now,
    });

    expect(spHeatmap.weekdayOrder).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(spHeatmap.summary.totalSeconds).toBe(3600);
    expect(spHeatmap.summary.activeDays).toBe(1);
    expect(spHeatmap.summary.bestDay).toEqual({
      dateKey: '2026-11-08',
      totalSeconds: 3600,
    });

    const utcHeatmap = buildActivityHeatmap({
      logs: [midnightBoundaryLog],
      timeZone: 'UTC',
      weekStartsOn: 0, // Sunday first
      range: 2026,
      now,
    });
    expect(utcHeatmap.weekdayOrder).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(utcHeatmap.summary.bestDay).toEqual({
      dateKey: '2026-11-09',
      totalSeconds: 3600,
    });
  });

  it('computes rolling 365-day matrix, adaptive intensity buckets, and cross-year streaks', () => {
    const now = new Date('2026-01-02T12:00:00.000Z');
    const logs: TimeLog[] = [
      // 3-day streak spanning Dec 31 -> Jan 2
      makeLog({ id: 's1', startTime: '2025-12-31T10:00:00.000Z', durationSeconds: 900 }), // 15m -> level 1
      makeLog({ id: 's2', startTime: '2026-01-01T10:00:00.000Z', durationSeconds: 3600 }), // 1h
      makeLog({ id: 's3', startTime: '2026-01-02T10:00:00.000Z', durationSeconds: 14400 }), // 4h
      // Separate 2-day run earlier in 2025
      makeLog({ id: 'e1', startTime: '2025-06-10T09:00:00.000Z', durationSeconds: 7200 }),
      makeLog({ id: 'e2', startTime: '2025-06-11T09:00:00.000Z', durationSeconds: 7200 }),
    ];

    const rolling = buildActivityHeatmap({
      logs,
      timeZone: 'UTC',
      weekStartsOn: 0,
      range: 'rolling_365',
      now,
    });

    expect(rolling.endDateKey).toBe('2026-01-02');
    expect(rolling.summary.activeDays).toBe(5);
    expect(rolling.summary.totalLogs).toBe(5);
    expect(rolling.summary.currentStreakDays).toBe(3);
    expect(rolling.summary.longestStreakDays).toBe(3);
    expect(rolling.summary.bestDay).toEqual({
      dateKey: '2026-01-02',
      totalSeconds: 14400,
    });

    // Verify adaptive intensity guard: a single 5m (300s) log stays at Level 1 against min 1h floor
    expect(computeHeatmapIntensityLevel(0, 0)).toBe(0);
    expect(computeHeatmapIntensityLevel(300, 300)).toBe(1);
    expect(computeHeatmapIntensityLevel(14400, 14400)).toBe(4);

    // Available years sorted descending with current year included
    expect(extractAvailableHeatmapYears(logs, 'UTC', now)).toEqual([2026, 2025]);
  });
});

describe('domain/toggl (Lossless Pre-Wipe Backup CSV Round-Trip)', () => {
  it('exports logs + unused projects + unused scoped tags + 3-level hierarchical tasks and restores them cleanly', async () => {
    const projects: Project[] = [
      {
        id: 'system_unassigned',
        userId: 'u1',
        name: 'General / Unassigned',
        color: '#8E8E93',
        isBillableDefault: false,
        systemKey: 'unassigned',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'proj-alpha',
        userId: 'u1',
        name: 'Alpha API',
        color: '#3B82F6',
        isBillableDefault: true,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'proj-unused',
        userId: 'u1',
        name: 'Empty Venture',
        color: '#10B981',
        isBillableDefault: false,
        createdAt: '2026-01-03T00:00:00.000Z',
      },
    ];

    const tags: ProjectTag[] = [
      { id: 'tag-used', userId: 'u1', projectId: 'proj-alpha', name: 'backend', createdAt: '' },
      { id: 'tag-unused', userId: 'u1', projectId: 'proj-alpha', name: 'security', createdAt: '' },
      { id: 'tag-venture', userId: 'u1', projectId: 'proj-unused', name: 'research', createdAt: '' },
      { id: 'tag-unassigned', userId: 'u1', projectId: 'system_unassigned', name: 'admin', createdAt: '' },
    ];

    const tasks: Task[] = [
      {
        id: 'task-1',
        userId: 'u1',
        projectId: 'proj-alpha',
        depth: 0,
        name: 'Auth Module',
        completedWorkHours: 0,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'task-2',
        userId: 'u1',
        projectId: 'proj-alpha',
        parentTaskId: 'task-1',
        depth: 1,
        name: 'OAuth Flow',
        completedWorkHours: 0,
        status: 'todo',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'task-3',
        userId: 'u1',
        projectId: 'proj-alpha',
        parentTaskId: 'task-2',
        depth: 2,
        name: 'PKCE Verification',
        completedWorkHours: 0,
        status: 'todo',
        createdAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'task-unassigned',
        userId: 'u1',
        projectId: 'system_unassigned',
        depth: 0,
        name: 'Weekly Review',
        completedWorkHours: 0,
        status: 'todo',
        createdAt: '2026-01-04T00:00:00.000Z',
      },
    ];

    const logs: TimeLog[] = [
      makeLog({
        id: 'log-1',
        projectId: 'proj-alpha',
        projectNameSnapshot: 'Alpha API',
        taskId: 'task-2',
        taskNameSnapshot: 'OAuth Flow',
        tagIds: ['tag-used'],
        description: 'Implement OAuth state check',
        normalizedDescription: 'implement oauth state check',
        startTime: '2026-11-20T10:00:00.000Z',
        durationSeconds: 3600,
      }),
    ];

    const backupCsv = serializeTogglCsv({
      logs,
      projects,
      tags,
      tasks,
      includeCatalogMetadata: true,
      userName: 'Gustavo',
      userEmail: 'gustavo@klox.dev',
    });

    // Simulate re-importing the backup CSV into a freshly wiped workspace
    const preview = await parseAndPreviewTogglCsv({
      csvText: backupCsv,
      existingProjects: [],
      existingTags: [],
      existingTasks: [],
      existingLogs: [],
    });

    expect(preview.errors).toHaveLength(0);
    expect(preview.newLogsCount).toBe(1);
    expect(preview.logRows[0]?.taskName).toBe('Auth Module / OAuth Flow');
    expect(preview.newProjectNames).toEqual(['Alpha API', 'Empty Venture']);
    expect(preview.newScopedTags).toEqual(
      expect.arrayContaining([
        { projectName: 'Alpha API', tagName: 'backend' },
        { projectName: 'Alpha API', tagName: 'security' },
        { projectName: 'Empty Venture', tagName: 'research' },
        { projectName: 'General / Unassigned', tagName: 'admin' },
      ])
    );
    expect(preview.newTasks).toEqual(
      expect.arrayContaining([
        { projectName: 'Alpha API', taskPath: 'Auth Module' },
        { projectName: 'Alpha API', taskPath: 'Auth Module / OAuth Flow' },
        { projectName: 'Alpha API', taskPath: 'Auth Module / OAuth Flow / PKCE Verification' },
        { projectName: 'General / Unassigned', taskPath: 'Weekly Review' },
      ])
    );
  });
});
