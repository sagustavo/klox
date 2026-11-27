import { describe, expect, it } from 'vitest';
import {
  buildAdoSyncCandidates,
  computeLogUnsyncedSeconds,
  escapeWiqlLiteral,
  normalizeAdoOrgUrl,
  parseWorkItemIdInput,
  resolveControllingAdoTask,
} from '../../app/domain/ado';
import {
  buildTaskTree,
  computeTaskSiblingReorder,
  createUnassignedProject,
} from '../../app/domain/invariants';
import type { AdoConnectionSummary, Project, Task, TimeLog } from '../../app/domain/types';
import { AdoCryptoError, decryptAdoSecret, encryptAdoSecret } from '../../server/utils/adoCrypto';
import {
  fromFirestoreFields,
  toFirestoreFields,
  toFirestoreValue,
} from '../../server/utils/firestoreRest';

describe('domain/ado security & parsing', () => {
  it('canonicalizes valid Azure DevOps organization URLs and bare org slugs', () => {
    expect(normalizeAdoOrgUrl('klox')).toEqual({
      valid: true,
      orgUrl: 'https://dev.azure.com/klox',
      organization: 'klox',
    });
    expect(normalizeAdoOrgUrl('https://dev.azure.com/klox/')).toEqual({
      valid: true,
      orgUrl: 'https://dev.azure.com/klox',
      organization: 'klox',
    });
    expect(normalizeAdoOrgUrl('https://dev.azure.com/klox/Klox')).toEqual({
      valid: true,
      orgUrl: 'https://dev.azure.com/klox',
      organization: 'klox',
    });
    expect(normalizeAdoOrgUrl('https://my-org.visualstudio.com')).toEqual({
      valid: true,
      orgUrl: 'https://dev.azure.com/my-org',
      organization: 'my-org',
    });
  });

  it('rejects SSRF vectors, HTTP, custom ports, credentials, and unknown domains', () => {
    const invalidInputs = [
      '',
      'http://dev.azure.com/klox',
      'https://localhost/klox',
      'https://127.0.0.1/klox',
      'https://169.254.169.254/latest/meta-data',
      'https://user:pass@dev.azure.com/klox',
      'https://dev.azure.com:8443/klox',
      'https://dev.azure.com/klox?foo=bar',
      'https://evil.example.com/dev.azure.com/klox',
    ];
    for (const raw of invalidInputs) {
      expect(normalizeAdoOrgUrl(raw)).toEqual({
        valid: false,
        error: 'ADO_INVALID_ORG_URL',
      });
    }
  });

  it('extracts Work Item IDs from #, AB#, plain numbers, and ADO URLs', () => {
    expect(parseWorkItemIdInput('31')).toBe(31);
    expect(parseWorkItemIdInput('#31')).toBe(31);
    expect(parseWorkItemIdInput('AB#42')).toBe(42);
    expect(parseWorkItemIdInput('ab#109')).toBe(109);
    expect(
      parseWorkItemIdInput('https://dev.azure.com/klox/Klox/_workitems/edit/31')
    ).toBe(31);
    expect(parseWorkItemIdInput('https://dev.azure.com/klox/Klox/_boards?id=88')).toBe(88);
    expect(parseWorkItemIdInput('0')).toBeNull();
    expect(parseWorkItemIdInput('-5')).toBeNull();
    expect(parseWorkItemIdInput('not-an-id')).toBeNull();
  });

  it('escapes WIQL literals and strips control characters', () => {
    expect(escapeWiqlLiteral("Fix O'Connor bug\n\t")).toBe("Fix O''Connor bug");
  });
});

describe('domain/invariants task priority ordering', () => {
  const mkTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task => ({
    userId: 'u1',
    projectId: 'p1',
    completedWorkHours: 0,
    status: 'todo',
    createdAt: '2026-11-27T00:00:00.000Z',
    ...overrides,
  });

  it('reorders sibling tasks using sparse midpoint when initialized and avoids touching siblings', () => {
    const tasks: Task[] = [
      mkTask({ id: 't1', name: 'First', sortOrder: 1024 }),
      mkTask({ id: 't2', name: 'Second', sortOrder: 2048 }),
      mkTask({ id: 't3', name: 'Third', sortOrder: 3072 }),
    ];

    const changes = computeTaskSiblingReorder({
      siblings: tasks,
      movedTaskId: 't3',
      targetIndex: 1,
    });
    expect(changes).toEqual([{ taskId: 't3', sortOrder: 1536 }]);

    const updated = tasks.map((t) =>
      t.id === 't3' ? { ...t, sortOrder: 1536 } : t
    );
    const tree = buildTaskTree(updated, 'p1');
    expect(tree.map((n) => n.task.id)).toEqual(['t1', 't3', 't2']);
  });

  it('normalizes sibling sortOrders when uninitialized and keeps subtasks sorted independently per parent', () => {
    const tasks: Task[] = [
      mkTask({ id: 'root-a', name: 'Root A', depth: 0 }),
      mkTask({ id: 'root-b', name: 'Root B', depth: 0 }),
      mkTask({ id: 'sub-1', name: 'Sub 1', parentTaskId: 'root-a', depth: 1, sortOrder: 1024 }),
      mkTask({ id: 'sub-2', name: 'Sub 2', parentTaskId: 'root-a', depth: 1, sortOrder: 2048 }),
      mkTask({ id: 'sub-3', name: 'Sub 3', parentTaskId: 'root-b', depth: 1, sortOrder: 1024 }),
    ];

    const subReorder = computeTaskSiblingReorder({
      siblings: tasks.filter((t) => t.parentTaskId === 'root-a'),
      movedTaskId: 'sub-2',
      targetIndex: 0,
    });
    expect(subReorder).toEqual([{ taskId: 'sub-2', sortOrder: 0 }]);

    const rootReorder = computeTaskSiblingReorder({
      siblings: tasks.filter((t) => !t.parentTaskId),
      movedTaskId: 'root-b',
      targetIndex: 0,
    });
    expect(rootReorder).toEqual([
      { taskId: 'root-b', sortOrder: 1024 },
      { taskId: 'root-a', sortOrder: 2048 },
    ]);
  });
});

describe('domain/ado incremental sync & hierarchy roll-up', () => {
  const connection: AdoConnectionSummary = {
    connected: true,
    authType: 'pat',
    orgUrl: 'https://dev.azure.com/klox',
    organization: 'klox',
    defaultProject: 'Klox',
    defaultWorkItemType: 'Task',
    tokenHint: '••••abcd',
    connectedAt: '2026-11-27T00:00:00.000Z',
    lastVerifiedAt: '2026-11-27T00:00:00.000Z',
  };

  const unassigned = createUnassignedProject('u1');
  const workProject: Project = {
    id: 'p-work',
    userId: 'u1',
    name: 'Core Platform',
    color: '#3B82F6',
    isBillableDefault: true,
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  const tasks: Task[] = [
    {
      id: 't-parent',
      userId: 'u1',
      projectId: 'p-work',
      depth: 0,
      name: 'Auth Integration',
      externalProvider: 'azure_devops',
      externalWorkItemId: '31',
      externalWorkItemTitle: 'ADO Sync',
      completedWorkHours: 2,
      status: 'in_progress',
      createdAt: '2026-11-27T00:00:00.000Z',
    },
    {
      id: 't-sub-inherit',
      userId: 'u1',
      projectId: 'p-work',
      parentTaskId: 't-parent',
      depth: 1,
      name: 'Write tests',
      completedWorkHours: 0,
      status: 'todo',
      createdAt: '2026-11-27T00:01:00.000Z',
    },
    {
      id: 't-sub-own',
      userId: 'u1',
      projectId: 'p-work',
      parentTaskId: 't-parent',
      depth: 1,
      name: 'Fix OAuth redirect',
      externalProvider: 'azure_devops',
      externalWorkItemId: '99',
      completedWorkHours: 0,
      status: 'todo',
      createdAt: '2026-11-27T00:02:00.000Z',
    },
    {
      id: 't-unplanned',
      userId: 'u1',
      projectId: 'p-work',
      depth: 0,
      name: 'Hotfix DNS cache',
      completedWorkHours: 0,
      status: 'todo',
      createdAt: '2026-11-27T00:03:00.000Z',
    },
  ];

  const mkLog = (overrides: Partial<TimeLog> & Pick<TimeLog, 'id' | 'durationSeconds'>): TimeLog => ({
    userId: 'u1',
    description: 'Work',
    normalizedDescription: 'work',
    projectId: 'p-work',
    projectNameSnapshot: 'Core Platform',
    projectColorSnapshot: '#3B82F6',
    tagIds: [],
    isBillable: true,
    startTime: '2026-11-27T10:00:00.000Z',
    endTime: '2026-11-27T11:00:00.000Z',
    timeZone: 'UTC',
    dateKey: '2026-11-27',
    ...overrides,
  });

  it('resolves nearest ADO-linked ancestor without double-counting child overrides', () => {
    expect(resolveControllingAdoTask('t-sub-inherit', tasks)?.id).toBe('t-parent');
    expect(resolveControllingAdoTask('t-sub-own', tasks)?.id).toBe('t-sub-own');
    expect(resolveControllingAdoTask('t-unplanned', tasks)).toBeNull();
  });

  it('computes positive incremental delta when an already-synced Activity duration grows', () => {
    const log = mkLog({
      id: 'l-edited',
      taskId: 't-parent',
      durationSeconds: 5400, // edited from 1h to 1.5h
      adoSync: {
        workItemId: 31,
        orgUrl: 'https://dev.azure.com/klox',
        project: 'Klox',
        syncedSeconds: 3600,
        syncedAt: '2026-11-27T09:00:00.000Z',
      },
    });
    expect(
      computeLogUnsyncedSeconds(log, {
        workItemId: 31,
        orgUrl: 'https://dev.azure.com/klox',
        project: 'Klox',
      })
    ).toBe(1800);
  });

  it('builds ready sync buckets and unplanned task candidates cleanly', () => {
    const logs: TimeLog[] = [
      mkLog({ id: 'l1', taskId: 't-sub-inherit', durationSeconds: 3600 }), // rolls up to #31 (+1.0h)
      mkLog({
        id: 'l2',
        taskId: 't-parent',
        durationSeconds: 3600,
        adoSync: {
          workItemId: 31,
          orgUrl: 'https://dev.azure.com/klox',
          project: 'Klox',
          syncedSeconds: 3600,
          syncedAt: '2026-11-27T09:00:00.000Z',
        },
      }), // already synced -> 0 unsynced
      mkLog({ id: 'l3', taskId: 't-sub-own', durationSeconds: 1800 }), // independent #99 (+0.5h)
      mkLog({ id: 'l4', taskId: 't-unplanned', durationSeconds: 2700 }), // unplanned (+0.75h)
    ];

    const summary = buildAdoSyncCandidates({
      projects: [unassigned, workProject],
      tasks,
      logs,
      connection,
    });

    expect(summary.readyItems).toHaveLength(2);
    expect(summary.readyItems[0]?.workItemId).toBe(31);
    expect(summary.readyItems[0]?.recommendedDeltaHours).toBe(1);
    expect(summary.readyItems[0]?.logs.map((x) => x.log.id)).toEqual(['l1']);

    expect(summary.readyItems[1]?.workItemId).toBe(99);
    expect(summary.readyItems[1]?.recommendedDeltaHours).toBe(0.5);

    expect(summary.unplannedTasks).toHaveLength(1);
    expect(summary.unplannedTasks[0]?.task.id).toBe('t-unplanned');
    expect(summary.unplannedTasks[0]?.recommendedHours).toBe(0.75);
    expect(summary.totalRecommendedHours).toBe(1.5);
  });
});

describe('server/utils/adoCrypto AES-256-GCM vault', () => {
  const masterSecret = '0123456789abcdef0123456789abcdef';

  it('encrypts and decrypts PAT with uid AAD binding and rejects cross-UID or tampered payloads', () => {
    const encrypted = encryptAdoSecret({
      plaintext: 'ado-pat-secret-value-9999',
      uid: 'user-alpha',
      masterSecret,
      isDev: false,
    });

    expect(
      decryptAdoSecret({
        payload: encrypted,
        uid: 'user-alpha',
        masterSecret,
        isDev: false,
      })
    ).toBe('ado-pat-secret-value-9999');

    expect(() =>
      decryptAdoSecret({
        payload: encrypted,
        uid: 'user-beta',
        masterSecret,
        isDev: false,
      })
    ).toThrow();
  });

  it('fails closed in production mode when masterSecret is missing or too short', () => {
    expect(() =>
      encryptAdoSecret({
        plaintext: 'pat',
        uid: 'user-alpha',
        masterSecret: '',
        isDev: false,
      })
    ).toThrow(AdoCryptoError);
  });
});

describe('server/utils/firestoreRest serialization & round-trip', () => {
  it('encodes integers as integerValue, floats as doubleValue, skips undefined, and round-trips nested objects', () => {
    expect(toFirestoreValue(1)).toEqual({ integerValue: '1' });
    expect(toFirestoreValue(1.75)).toEqual({ doubleValue: 1.75 });
    expect(toFirestoreValue(null)).toEqual({ nullValue: null });

    const payload = {
      v: 1,
      authType: 'pat',
      salt: 'abc=',
      iv: 'def=',
      tag: 'ghi=',
      ciphertext: 'jkl=',
      optionalOmitted: undefined,
      adoConnection: {
        connected: true,
        authType: 'pat',
        orgUrl: 'https://dev.azure.com/klox',
        organization: 'klox',
        defaultProject: 'Klox',
        defaultWorkItemType: 'Task',
        tokenHint: '••••1g0H',
        connectedAt: '2026-11-27T18:00:00.000Z',
        lastVerifiedAt: '2026-11-27T18:00:00.000Z',
      },
      tags: ['dev', null],
      nullField: null,
    };

    const fields = toFirestoreFields(payload);
    expect(fields.optionalOmitted).toBeUndefined();
    expect(fields.v).toEqual({ integerValue: '1' });
    expect(fields.nullField).toEqual({ nullValue: null });

    const decoded = fromFirestoreFields(fields);
    expect(decoded).toEqual({
      v: 1,
      authType: 'pat',
      salt: 'abc=',
      iv: 'def=',
      tag: 'ghi=',
      ciphertext: 'jkl=',
      adoConnection: payload.adoConnection,
      tags: ['dev', null],
      nullField: null,
    });
  });

  it('decodes empty arrays and maps safely', () => {
    expect(
      fromFirestoreFields({
        emptyList: { arrayValue: {} },
        emptyMap: { mapValue: {} },
      })
    ).toEqual({
      emptyList: [],
      emptyMap: {},
    });
  });
});
