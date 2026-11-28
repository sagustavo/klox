import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADO_COMPLETED_WORK_FIELD,
  buildAdoSyncCandidates,
  buildEffectiveCompletedWorkMap,
  classificationNodePathToIterationPath,
  classifyIterationTimeFrame,
  computeLogUnsyncedSeconds,
  escapeWiqlLiteral,
  evaluateTaskTimerEligibility,
  getAdoWorkItemTypeVisual,
  groupAdoSyncCandidatesByParent,
  normalizeAdoFieldRef,
  normalizeAdoOrgUrl,
  normalizeStoredAdoConnections,
  parseWorkItemIdInput,
  pickDefaultCurrentIteration,
  resolveControllingAdoTask,
  resolveEffectiveProjectAdoTarget,
  resolveTaskSupportsCompletedWork,
  type AdoIterationInfo,
} from '../../app/domain/ado';
import {
  buildTaskTree,
  classifyDueDateTone,
  collectBulkDeleteTaskIds,
  computeBulkTaskTagIds,
  computeTaskReparent,
  computeTaskSelectionTransition,
  computeTaskSiblingReorder,
  createUnassignedProject,
  filterTaskTree,
  flattenVisibleTaskTree,
  formatCompactTaskLabel,
  isTaskBranchFullyDone,
  isValidTaskDueDate,
  paginateTaskRoots,
  sanitizeTaskTagIds,
  summarizeSelectedTaskTags,
  tasksToCsv,
  tasksToMarkdownTable,
} from '../../app/domain/invariants';
import type { AdoConnectionSummary, Project, ProjectTag, Task, TimeLog } from '../../app/domain/types';
import {
  AdoCryptoError,
  decryptAdoSecret,
  decryptAdoTokenMap,
  encryptAdoSecret,
  encryptAdoTokenMap,
} from '../../server/utils/adoCrypto';
import {
  fromFirestoreFields,
  toFirestoreFields,
  toFirestoreValue,
} from '../../server/utils/firestoreRest';

describe('domain/ado security, parsing, iterations & type visuals', () => {
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

  it('converts ADO classification paths and selects the active Current Sprint', () => {
    expect(classificationNodePathToIterationPath('\\Klox\\Iteration\\Sprint 4')).toBe(
      'Klox\\Sprint 4'
    );
    expect(classificationNodePathToIterationPath('\\Klox\\Iteration\\Release 1\\Sprint 2')).toBe(
      'Klox\\Release 1\\Sprint 2'
    );
    expect(classificationNodePathToIterationPath('\\Klox\\Iteration')).toBe('Klox');

    expect(
      classifyIterationTimeFrame('2026-11-23T00:00:00Z', '2026-11-29T00:00:00Z', '2026-11-27')
    ).toBe('current');
    expect(
      classifyIterationTimeFrame('2026-11-16T00:00:00Z', '2026-11-22T00:00:00Z', '2026-11-27')
    ).toBe('past');
    expect(
      classifyIterationTimeFrame('2026-11-30T00:00:00Z', '2026-12-06T00:00:00Z', '2026-11-27')
    ).toBe('future');

    const iterations: AdoIterationInfo[] = [
      {
        id: 9,
        name: 'Sprint 3',
        displayPath: 'Sprint 3',
        iterationPath: 'Klox\\Sprint 3',
        timeFrame: 'past',
      },
      {
        id: 10,
        name: 'Sprint 4',
        displayPath: 'Sprint 4',
        iterationPath: 'Klox\\Sprint 4',
        timeFrame: 'current',
      },
      {
        id: 11,
        name: 'Sprint 5',
        displayPath: 'Sprint 5',
        iterationPath: 'Klox\\Sprint 5',
        timeFrame: 'future',
      },
    ];
    expect(pickDefaultCurrentIteration(iterations)?.iterationPath).toBe('Klox\\Sprint 4');
  });

  it('maps Work Item Type names to semantic icon kinds and short labels', () => {
    expect(getAdoWorkItemTypeVisual('Product Backlog Item')).toEqual({
      kind: 'pbi',
      shortLabel: 'PBI',
      fullName: 'Product Backlog Item',
    });
    expect(getAdoWorkItemTypeVisual('User Story').shortLabel).toBe('US');
    expect(getAdoWorkItemTypeVisual('Bug').kind).toBe('bug');
    expect(getAdoWorkItemTypeVisual('Task').kind).toBe('task');
    expect(getAdoWorkItemTypeVisual('Feature').kind).toBe('feature');
    expect(getAdoWorkItemTypeVisual('Epic').kind).toBe('epic');
    expect(getAdoWorkItemTypeVisual('Issue').kind).toBe('issue');
  });
});

describe('domain/invariants task priority ordering & Tab reparenting', () => {
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

  it('handles Tab indent and Shift+Tab outdent reparenting while enforcing MAX_TASK_DEPTH = 2', () => {
    const tasks: Task[] = [
      mkTask({ id: 'root-a', name: 'PBI 72', depth: 0, sortOrder: 1024 }),
      mkTask({ id: 'root-b', name: 'Standalone', depth: 0, sortOrder: 2048 }),
      mkTask({ id: 'child-1', name: 'Child of Standalone', parentTaskId: 'root-b', depth: 1, sortOrder: 1024 }),
      mkTask({ id: 'sub-a', name: 'Task 76', parentTaskId: 'root-a', depth: 1, sortOrder: 1024 }),
      mkTask({ id: 'subsub-a', name: 'Sub-sub', parentTaskId: 'sub-a', depth: 2, sortOrder: 1024 }),
    ];

    // Indent Standalone (depth 0 with child depth 1) under PBI 72 (depth 0) -> moves root-b -> 1, child-1 -> 2
    const indentOk = computeTaskReparent({
      taskId: 'root-b',
      newParentTaskId: 'root-a',
      allTasks: tasks,
    });
    expect(indentOk.valid).toBe(true);
    expect(indentOk.updates).toEqual([
      { taskId: 'root-b', parentTaskId: 'root-a', depth: 1, sortOrder: 2048 },
      { taskId: 'child-1', parentTaskId: 'root-b', depth: 2 },
    ]);

    // Attempting to indent Standalone under Task 76 (depth 1) would push child-1 to depth 3 -> rejected!
    const tooDeep = computeTaskReparent({
      taskId: 'root-b',
      newParentTaskId: 'sub-a',
      allTasks: tasks,
    });
    expect(tooDeep.valid).toBe(false);
    expect(tooDeep.error).toBe('TASK_MAX_DEPTH_EXCEEDED');

    // Outdent Sub-subtask up to root-a
    const outdentOk = computeTaskReparent({
      taskId: 'subsub-a',
      newParentTaskId: 'root-a',
      allTasks: tasks,
    });
    expect(outdentOk.valid).toBe(true);
    expect(outdentOk.updates[0]?.depth).toBe(1);
  });
});

describe('domain/ado incremental sync, PBI -> Task -> Sub-subtask roll-up & multi-connection routing', () => {
  const connWork: AdoConnectionSummary = {
    id: 'conn-work',
    kloxProjectId: 'p-work',
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

  const connSide: AdoConnectionSummary = {
    id: 'conn-side',
    kloxProjectId: 'p-side',
    connected: true,
    authType: 'pat',
    orgUrl: 'https://dev.azure.com/sideorg',
    organization: 'sideorg',
    defaultProject: 'SideProj',
    defaultWorkItemType: 'Task',
    tokenHint: '••••9999',
    connectedAt: '2026-11-27T00:00:00.000Z',
    lastVerifiedAt: '2026-11-27T00:00:00.000Z',
  };

  const unassigned = createUnassignedProject('u1');
  const workProject: Project = {
    id: 'p-work',
    userId: 'u1',
    name: 'Klox Platform',
    color: '#3B82F6',
    isBillableDefault: true,
    createdAt: '2026-11-27T00:00:00.000Z',
  };
  const unboundProject: Project = {
    id: 'p-personal',
    userId: 'u1',
    name: 'Marathon Prep',
    color: '#10B981',
    isBillableDefault: false,
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  const mkLog = (overrides: Partial<TimeLog> & Pick<TimeLog, 'id' | 'durationSeconds'>): TimeLog => ({
    userId: 'u1',
    description: 'Work',
    normalizedDescription: 'work',
    projectId: 'p-work',
    projectNameSnapshot: 'Klox Platform',
    projectColorSnapshot: '#3B82F6',
    tagIds: [],
    isBillable: true,
    startTime: '2026-11-27T10:00:00.000Z',
    endTime: '2026-11-27T11:00:00.000Z',
    timeZone: 'UTC',
    dateKey: '2026-11-27',
    ...overrides,
  });

  it('sums manual Level-2 Sub-subtasks onto the parent ADO Task (depth 1) under a PBI (depth 0) without leaking to the PBI', () => {
    const tasks: Task[] = [
      {
        id: 'k-pbi-72',
        userId: 'u1',
        projectId: 'p-work',
        depth: 0,
        name: '[UX-2.1] Brand Logo Tracking',
        externalProvider: 'azure_devops',
        externalWorkItemId: '72',
        externalWorkItemTitle: '[UX-2.1] Brand Logo Tracking',
        externalWorkItemType: 'Product Backlog Item',
        completedWorkHours: 0,
        status: 'in_progress',
        createdAt: '2026-11-27T00:00:00.000Z',
      },
      {
        id: 'k-task-76',
        userId: 'u1',
        projectId: 'p-work',
        parentTaskId: 'k-pbi-72',
        depth: 1,
        name: 'Fix Logo Letter-Spacing Cascade',
        externalProvider: 'azure_devops',
        externalWorkItemId: '76',
        externalWorkItemTitle: 'Fix Logo Letter-Spacing Cascade',
        externalWorkItemType: 'Task',
        completedWorkHours: 1.0,
        status: 'in_progress',
        createdAt: '2026-11-27T00:01:00.000Z',
      },
      {
        id: 'k-subsub-1',
        userId: 'u1',
        projectId: 'p-work',
        parentTaskId: 'k-task-76',
        depth: 2,
        name: 'Audit wordmark tracking tokens',
        completedWorkHours: 0,
        status: 'done',
        createdAt: '2026-11-27T00:02:00.000Z',
      },
      {
        id: 'k-subsub-2',
        userId: 'u1',
        projectId: 'p-work',
        parentTaskId: 'k-task-76',
        depth: 2,
        name: 'Update SVG favicon',
        completedWorkHours: 0,
        status: 'todo',
        createdAt: '2026-11-27T00:03:00.000Z',
      },
      {
        id: 'k-unplanned',
        userId: 'u1',
        projectId: 'p-work',
        depth: 0,
        name: 'Emergency DNS check',
        completedWorkHours: 0,
        status: 'todo',
        createdAt: '2026-11-27T00:04:00.000Z',
      },
    ];

    expect(resolveControllingAdoTask('k-subsub-1', tasks)?.id).toBe('k-task-76');
    expect(resolveControllingAdoTask('k-subsub-2', tasks)?.id).toBe('k-task-76');
    expect(resolveControllingAdoTask('k-unplanned', tasks)).toBeNull();

    const logs: TimeLog[] = [
      mkLog({ id: 'l-subsub-1', taskId: 'k-subsub-1', durationSeconds: 4500 }), // 1.25h
      mkLog({ id: 'l-subsub-2', taskId: 'k-subsub-2', durationSeconds: 2700 }), // 0.75h
      mkLog({ id: 'l-direct', taskId: 'k-task-76', durationSeconds: 1800 }), // 0.50h
      mkLog({ id: 'l-unplanned', taskId: 'k-unplanned', durationSeconds: 900 }), // 0.25h
    ];

    const summary = buildAdoSyncCandidates({
      projects: [unassigned, workProject, unboundProject],
      tasks,
      logs,
      connections: [connWork, connSide],
    });

    // Strictly ONE ADO item (#76, NOT PBI #72) with total 2.50h = 1.25h + 0.75h + 0.50h
    expect(summary.readyItems).toHaveLength(1);
    const targetItem = summary.readyItems[0]!;
    expect(targetItem.connectionId).toBe('conn-work');
    expect(targetItem.workItemId).toBe(76);
    expect(targetItem.recommendedDeltaHours).toBe(2.5);
    expect(targetItem.logs.map((e) => e.isRolledUpFromDescendant)).toEqual([true, true, false]);

    // Sub-subtasks do NOT appear as unplanned tasks; only k-unplanned does
    expect(summary.unplannedTasks).toHaveLength(1);
    expect(summary.unplannedTasks[0]?.task.id).toBe('k-unplanned');
  });

  it('routes projects strictly to their bound ADO connection and ignores unbound projects', () => {
    expect(
      resolveEffectiveProjectAdoTarget(workProject, [connWork, connSide])?.connectionId
    ).toBe('conn-work');
    expect(resolveEffectiveProjectAdoTarget(unboundProject, [connWork, connSide])).toBeNull();
    expect(resolveEffectiveProjectAdoTarget(unassigned, [connWork, connSide])).toBeNull();

    const migrated = normalizeStoredAdoConnections({
      adoConnection: {
        connected: true,
        authType: 'pat',
        orgUrl: 'https://dev.azure.com/klox',
        organization: 'klox',
        defaultProject: 'Klox',
        defaultWorkItemType: 'Task',
        tokenHint: '••••old1',
        connectedAt: '2026-11-27T00:00:00.000Z',
        lastVerifiedAt: '2026-11-27T00:00:00.000Z',
      },
    });
    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.id).toBe('legacy_default');
    expect(migrated[0]?.kloxProjectId).toBe('');
  });

  it('computes positive incremental delta when an already-synced Activity duration grows', () => {
    const log = mkLog({
      id: 'l-edited',
      taskId: 'k-task-76',
      durationSeconds: 5400,
      adoSync: {
        workItemId: 76,
        orgUrl: 'https://dev.azure.com/klox',
        project: 'Klox',
        syncedSeconds: 3600,
        syncedAt: '2026-11-27T09:00:00.000Z',
      },
    });
    expect(
      computeLogUnsyncedSeconds(log, {
        workItemId: 76,
        orgUrl: 'https://dev.azure.com/klox',
        project: 'Klox',
      })
    ).toBe(1800);
  });
});

describe('server/utils/adoCrypto AES-256-GCM multi-token vault', () => {
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

  it('supports multi-connection token maps and migrates legacy v1 plaintokens cleanly', () => {
    const mapPayload = encryptAdoTokenMap({
      tokens: { conn_1: 'pat-one', conn_2: 'pat-two' },
      uid: 'user-alpha',
      masterSecret,
      isDev: false,
    });
    expect(
      decryptAdoTokenMap({ payload: mapPayload, uid: 'user-alpha', masterSecret, isDev: false })
    ).toEqual({
      conn_1: 'pat-one',
      conn_2: 'pat-two',
    });

    const legacyV1Payload = encryptAdoSecret({
      plaintext: 'legacy-single-pat',
      uid: 'user-alpha',
      masterSecret,
      isDev: false,
    });
    expect(
      decryptAdoTokenMap({
        payload: legacyV1Payload,
        uid: 'user-alpha',
        masterSecret,
        isDev: false,
      })
    ).toEqual({
      legacy_default: 'legacy-single-pat',
    });
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
  it('encodes integers as integerValue, floats as doubleValue, skips undefined, and round-trips nested arrays/objects', () => {
    expect(toFirestoreValue(1)).toEqual({ integerValue: '1' });
    expect(toFirestoreValue(1.75)).toEqual({ doubleValue: 1.75 });
    expect(toFirestoreValue(null)).toEqual({ nullValue: null });

    const payload = {
      v: 1,
      authType: 'pat',
      optionalOmitted: undefined,
      adoConnections: [
        {
          id: 'conn_1',
          kloxProjectId: 'p_1',
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
      ],
      adoConnection: null,
    };

    const fields = toFirestoreFields(payload);
    expect(fields.optionalOmitted).toBeUndefined();
    expect(fields.v).toEqual({ integerValue: '1' });
    expect(fields.adoConnection).toEqual({ nullValue: null });

    const decoded = fromFirestoreFields(fields);
    expect(decoded).toEqual({
      v: 1,
      authType: 'pat',
      adoConnections: payload.adoConnections,
      adoConnection: null,
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

describe('domain/invariants task scoped tags, deadlines, multi-select & bulk delete', () => {
  const projectTags: ProjectTag[] = [
    { id: 'tag-p1-a', userId: 'u1', projectId: 'p1', name: 'Backend', createdAt: '2026-11-27T00:00:00Z' },
    { id: 'tag-p1-b', userId: 'u1', projectId: 'p1', name: 'Bugfix', createdAt: '2026-11-27T00:00:00Z' },
    { id: 'tag-p2-x', userId: 'u1', projectId: 'p2', name: 'Other Project', createdAt: '2026-11-27T00:00:00Z' },
  ];

  const mkTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task => ({
    userId: 'u1',
    projectId: 'p1',
    completedWorkHours: 0,
    status: 'todo',
    createdAt: '2026-11-27T00:00:00.000Z',
    ...overrides,
  });

  it('enforces project-scoped Tag ownership and validates Task deadlines cleanly', () => {
    expect(
      sanitizeTaskTagIds(['tag-p1-a', 'tag-p2-x', 'tag-p1-a', 'missing', 'tag-p1-b'], 'p1', projectTags)
    ).toEqual(['tag-p1-a', 'tag-p1-b']);

    expect(isValidTaskDueDate('2026-11-30')).toBe(true);
    expect(isValidTaskDueDate('2026/11/30')).toBe(false);
    expect(isValidTaskDueDate(null)).toBe(false);

    expect(classifyDueDateTone('2026-11-25', '2026-11-27', 'todo')).toBe('overdue');
    expect(classifyDueDateTone('2026-11-27', '2026-11-27', 'in_progress')).toBe('today');
    expect(classifyDueDateTone('2026-12-01', '2026-11-27', 'todo')).toBe('upcoming');
    expect(classifyDueDateTone('2026-11-25', '2026-11-27', 'done')).toBe('done');
  });

  it('supports click, Ctrl/Cmd toggle, Shift range, and Arrow/Shift+Arrow multi-selection across flattened tasks', () => {
    const ordered = ['t1', 'sub1', 'subsub1', 't2', 't3'];

    let sel = computeTaskSelectionTransition(
      { selectedIds: [], anchorId: null, focusedId: null },
      { type: 'plain', taskId: 'sub1' },
      ordered
    );
    expect(sel).toEqual({ selectedIds: ['sub1'], anchorId: 'sub1', focusedId: 'sub1' });

    sel = computeTaskSelectionTransition(sel, { type: 'range', taskId: 't2' }, ordered);
    expect(sel.selectedIds).toEqual(['sub1', 'subsub1', 't2']);
    expect(sel.anchorId).toBe('sub1');
    expect(sel.focusedId).toBe('t2');

    sel = computeTaskSelectionTransition(sel, { type: 'toggle', taskId: 'subsub1' }, ordered);
    expect(sel.selectedIds).toEqual(['sub1', 't2']);

    sel = computeTaskSelectionTransition(
      { selectedIds: ['t1'], anchorId: 't1', focusedId: 't1' },
      { type: 'arrow', direction: 'down', extendRange: true },
      ordered
    );
    expect(sel).toEqual({
      selectedIds: ['t1', 'sub1'],
      anchorId: 't1',
      focusedId: 'sub1',
    });

    sel = computeTaskSelectionTransition(sel, { type: 'selectAll' }, ordered);
    expect(sel.selectedIds).toEqual(ordered);

    sel = computeTaskSelectionTransition(sel, { type: 'clear' }, ordered);
    expect(sel.selectedIds).toEqual([]);
  });

  it('deduplicates parent and child tasks when computing bulk cascade deletion targets', () => {
    const tasks: Task[] = [
      mkTask({ id: 'root-1', name: 'Root 1', depth: 0 }),
      mkTask({ id: 'sub-1', name: 'Sub 1', parentTaskId: 'root-1', depth: 1 }),
      mkTask({ id: 'subsub-1', name: 'SubSub 1', parentTaskId: 'sub-1', depth: 2 }),
      mkTask({ id: 'root-2', name: 'Root 2', depth: 0 }),
    ];

    expect(collectBulkDeleteTaskIds(['root-1', 'sub-1', 'root-2'], tasks)).toEqual([
      'root-1',
      'sub-1',
      'subsub-1',
      'root-2',
    ]);
  });
});

describe('domain/invariants board filtering, completed partitioning, pagination, compact labels & export', () => {
  const mkProject = (id: string, name: string): Project => ({
    id,
    userId: 'u1',
    name,
    color: '#3B82F6',
    isBillableDefault: true,
    createdAt: '2026-11-27T00:00:00Z',
  });

  const mkTag = (id: string, projectId: string, name: string): ProjectTag => ({
    id,
    userId: 'u1',
    projectId,
    name,
    createdAt: '2026-11-27T00:00:00Z',
  });

  const mkTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task => ({
    userId: 'u1',
    projectId: 'p1',
    completedWorkHours: 0,
    status: 'todo',
    createdAt: '2026-11-27T00:00:00Z',
    ...overrides,
  });

  it('keeps a task active unless the task AND all of its descendants are done', () => {
    const tasks: Task[] = [
      mkTask({ id: 't1', name: 'Story', depth: 0, sortOrder: 1000, status: 'done' }),
      mkTask({ id: 't1-sub', name: 'Child still open', parentTaskId: 't1', depth: 1, sortOrder: 1000, status: 'todo' }),
      mkTask({ id: 't2', name: 'Closed Story', depth: 0, sortOrder: 2000, status: 'done' }),
      mkTask({ id: 't2-sub', name: 'Closed Sub', parentTaskId: 't2', depth: 1, sortOrder: 1000, status: 'done' }),
      mkTask({ id: 't2-subsub', name: 'Closed Leaf', parentTaskId: 't2-sub', depth: 2, sortOrder: 1000, status: 'done' }),
    ];

    const roots = buildTaskTree(tasks, 'p1');
    expect(isTaskBranchFullyDone(roots[0]!)).toBe(false);
    expect(isTaskBranchFullyDone(roots[1]!)).toBe(true);
  });

  it('filters task trees by query, ADO ID, tags, untagged, linkFilter and auto-expands matching parents', () => {
    const tasks: Task[] = [
      mkTask({ id: 'r1', name: 'Auth Feature', depth: 0, sortOrder: 1000, externalWorkItemId: '31', tagIds: ['tag-1'] }),
      mkTask({ id: 'r1-s1', name: 'JWT Middleware', parentTaskId: 'r1', depth: 1, sortOrder: 1000, externalWorkItemId: '3101', tagIds: ['tag-2'], dueDate: '2026-11-20' }),
      mkTask({ id: 'r2', name: 'Local Cleanup', depth: 0, sortOrder: 2000 }),
    ];
    const roots = buildTaskTree(tasks, 'p1');

    const byAdoId = filterTaskTree(roots, { query: 'AB#3101' });
    expect(byAdoId.roots).toHaveLength(1);
    expect(byAdoId.roots[0]!.children).toHaveLength(1);
    expect(byAdoId.autoExpandedIds).toEqual(['r1']);

    const byTag = filterTaskTree(roots, { tagIds: ['tag-2'] });
    expect(byTag.roots).toHaveLength(1);
    expect(byTag.roots[0]!.task.id).toBe('r1');
    expect(byTag.autoExpandedIds).toEqual(['r1']);

    const untagged = filterTaskTree(roots, { includeUntagged: true });
    expect(untagged.roots.map((n) => n.task.id)).toEqual(['r2']);

    const overdue = filterTaskTree(roots, {
      linkFilter: 'overdue',
      todayDateKey: '2026-11-28',
    });
    expect(overdue.roots).toHaveLength(1);
    expect(overdue.roots[0]!.children[0]!.task.id).toBe('r1-s1');

    const unlinked = filterTaskTree(roots, { linkFilter: 'unlinked' });
    expect(unlinked.roots.map((n) => n.task.id)).toEqual(['r2']);
  });

  it('flattens visible nodes respecting collapsed parents and paginates root trees cleanly', () => {
    const tasks: Task[] = [];
    for (let i = 1; i <= 12; i++) {
      tasks.push(mkTask({ id: `root-${i}`, name: `Root ${i}`, depth: 0, sortOrder: i * 1000 }));
    }
    tasks.push(
      mkTask({ id: 'sub-1', name: 'Sub 1', parentTaskId: 'root-1', depth: 1, sortOrder: 1000 }),
      mkTask({ id: 'sub-2', name: 'Sub 2', parentTaskId: 'root-2', depth: 1, sortOrder: 1000 })
    );

    const roots = buildTaskTree(tasks, 'p1');
    const page1 = paginateTaskRoots(roots, 0); // default 10 per page
    expect(page1.totalItems).toBe(12);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(10);
    expect(page1.hasPreviousPage).toBe(false);
    expect(page1.hasNextPage).toBe(true);

    const visibleCollapsed = flattenVisibleTaskTree(page1.items, new Set(['root-1']));
    expect(visibleCollapsed.some((n) => n.task.id === 'sub-1')).toBe(false);
    expect(visibleCollapsed.some((n) => n.task.id === 'sub-2')).toBe(true);

    const pageOut = paginateTaskRoots(roots, 99, 25);
    expect(pageOut.pageIndex).toBe(0);
    expect(pageOut.items).toHaveLength(12);
  });

  it('formats compact task badges cleanly (AB#Parent / Child vs concise personal task name)', () => {
    const pbi = mkTask({ id: 'pbi', name: 'Long Feature Title That Would Bloat UI', externalWorkItemId: '31', depth: 0 });
    const childAdo = mkTask({ id: 'ado-sub', name: 'Implement Token Guard', parentTaskId: 'pbi', externalWorkItemId: '3101', depth: 1 });
    const localParent = mkTask({ id: 'loc-p', name: 'Study Architecture', depth: 0 });
    const localChild = mkTask({ id: 'loc-c', name: 'Read Chapter 4', parentTaskId: 'loc-p', depth: 1 });
    const all = [pbi, childAdo, localParent, localChild];

    expect(formatCompactTaskLabel(childAdo, all)).toBe('AB#31 / 3101');
    expect(formatCompactTaskLabel(pbi, all)).toBe('AB#31');
    expect(formatCompactTaskLabel(localChild, all)).toBe('Read Chapter 4');
  });

  it('exports selected tasks to Markdown table and UTF-8 BOM CSV', () => {
    const p1 = mkProject('p1', 'Klox Core');
    const tag1 = mkTag('tag-1', 'p1', 'Sprint 12');
    const tRoot = mkTask({
      id: 't1',
      name: 'Build Execution Board',
      externalWorkItemId: '42',
      externalWorkItemType: 'Product Backlog Item',
      status: 'in_progress',
      tagIds: ['tag-1'],
      dueDate: '2026-12-01',
      completedWorkHours: 1.5,
      depth: 0,
    });
    const tChild = mkTask({
      id: 't2',
      name: 'Add Context Menu, Shortcuts',
      parentTaskId: 't1',
      status: 'done',
      depth: 1,
    });

    const ctx = {
      allTasks: [tRoot, tChild],
      projects: [p1],
      tags: [tag1],
      trackedSecondsByTask: new Map([['t1', 5400], ['t2', 1800]]),
    };

    const md = tasksToMarkdownTable([tRoot, tChild], ctx);
    expect(md).toContain('| AB#42 | Build Execution Board | in_progress | Sprint 12 | 2026-12-01 | 01:30:00 |');
    expect(md).toContain('| — | ↳ Add Context Menu, Shortcuts | done | — | — | 00:30:00 |');

    const csv = tasksToCsv([tRoot, tChild], ctx);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Work Item,Type,Parent,Task,Status,Project,Tags,Deadline,Tracked Duration,ADO Completed Hours');
    expect(csv).toContain('#42,Product Backlog Item,,Build Execution Board,in_progress,Klox Core,Sprint 12,2026-12-01,01:30:00,1.5');
    expect(csv).toContain(',,Build Execution Board,"Add Context Menu, Shortcuts",done,Klox Core,,,00:30:00,0');
  });
});

describe('domain/ado custom field, task timer eligibility, completed work rollup & sync tree', () => {
  const mkProj = (id: string, name = 'Klox'): Project => ({
    id,
    userId: 'u1',
    name,
    color: '#3B82F6',
    isBillableDefault: true,
    createdAt: '2026-11-27T00:00:00.000Z',
  });

  const mkItem = (overrides: Partial<Task> & { id: string; name: string }): Task => ({
    userId: 'u1',
    projectId: 'p1',
    completedWorkHours: 0,
    status: 'todo',
    createdAt: '2026-11-27T00:00:00.000Z',
    ...(overrides.externalWorkItemId ? { externalProvider: 'azure_devops' as const } : {}),
    ...overrides,
  });

  const mkTimeLog = (overrides: Partial<TimeLog> & { id: string; taskId: string; durationSeconds: number }): TimeLog => ({
    userId: 'u1',
    description: 'Implementation',
    normalizedDescription: 'implementation',
    projectId: 'p1',
    projectNameSnapshot: 'Klox',
    projectColorSnapshot: '#3B82F6',
    tagIds: [],
    isBillable: true,
    startTime: '2026-11-27T10:00:00.000Z',
    endTime: new Date(Date.parse('2026-11-27T10:00:00.000Z') + overrides.durationSeconds * 1000).toISOString(),
    timeZone: 'UTC',
    dateKey: '2026-11-27',
    ...overrides,
  });

  it('normalizes and validates custom ADO completed work field references', () => {
    expect(normalizeAdoFieldRef()).toEqual({
      valid: true,
      fieldRef: DEFAULT_ADO_COMPLETED_WORK_FIELD,
    });
    expect(normalizeAdoFieldRef('  Custom.ActualHours  ')).toEqual({
      valid: true,
      fieldRef: 'Custom.ActualHours',
    });
    expect(normalizeAdoFieldRef('InvalidFieldNoDot')).toEqual({
      valid: false,
      error: 'ADO_INVALID_INPUT',
    });
    expect(normalizeAdoFieldRef('bad space.Field')).toEqual({
      valid: false,
      error: 'ADO_INVALID_INPUT',
    });
  });

  it('evaluates timer eligibility for parent tasks and non-CompletedWork ADO items with policy overrides', () => {
    const storyParent = mkItem({
      id: 'story-1',
      name: 'Auth Story',
      depth: 0,
      externalWorkItemId: '100',
      externalWorkItemType: 'User Story',
      externalSupportsCompletedWork: false,
    });
    const adoTaskChild = mkItem({
      id: 'task-1',
      parentTaskId: 'story-1',
      name: 'Build OAuth endpoint',
      depth: 1,
      externalWorkItemId: '101',
      externalWorkItemType: 'Task',
      externalSupportsCompletedWork: true,
    });
    const soloStory = mkItem({
      id: 'story-2',
      name: 'Standalone PBI',
      depth: 0,
      externalWorkItemId: '200',
      externalWorkItemType: 'Product Backlog Item',
      externalSupportsCompletedWork: false,
    });

    const all = [storyParent, adoTaskChild, soloStory];
    const types = [
      { name: 'Task', supportsCompletedWork: true },
      { name: 'User Story', supportsCompletedWork: false },
      { name: 'Product Backlog Item', supportsCompletedWork: false },
    ];

    // Default policy: blocks parent with subtasks AND unsupported ADO items
    expect(
      evaluateTaskTimerEligibility({ task: storyParent, allTasks: all, workItemTypes: types })
    ).toEqual({ allowed: false, reason: 'PARENT_HAS_SUBTASKS' });
    expect(
      evaluateTaskTimerEligibility({ task: soloStory, allTasks: all, workItemTypes: types })
    ).toEqual({ allowed: false, reason: 'ADO_COMPLETED_WORK_UNSUPPORTED' });
    expect(
      evaluateTaskTimerEligibility({ task: adoTaskChild, allTasks: all, workItemTypes: types })
    ).toEqual({ allowed: true, reason: null });

    // Opt-in policy overrides allow local tracking in Klox
    expect(
      evaluateTaskTimerEligibility({
        task: storyParent,
        allTasks: all,
        workItemTypes: types,
        policy: { allowParentTaskTracking: true, allowNonCompletedWorkTracking: false },
      })
    ).toEqual({ allowed: true, reason: null });

    expect(
      evaluateTaskTimerEligibility({
        task: storyParent,
        allTasks: all,
        workItemTypes: types,
        policy: { allowParentTaskTracking: true, allowNonCompletedWorkTracking: true },
      })
    ).toEqual({ allowed: true, reason: null });

    expect(
      evaluateTaskTimerEligibility({
        task: soloStory,
        allTasks: all,
        workItemTypes: types,
        policy: { allowNonCompletedWorkTracking: true },
      })
    ).toEqual({ allowed: true, reason: null });
    expect(resolveTaskSupportsCompletedWork(soloStory, types)).toBe(false);
  });

  it('rolls up parent CompletedWork from children while preserving Level-1 ADO Task own hours over manual sub-subtasks', () => {
    const story = mkItem({
      id: 'story-1',
      name: 'Story',
      depth: 0,
      externalWorkItemId: '10',
      externalWorkItemType: 'User Story',
      completedWorkHours: 0,
    });
    const childTaskA = mkItem({
      id: 't-a',
      parentTaskId: 'story-1',
      name: 'API Task',
      depth: 1,
      externalWorkItemId: '11',
      externalWorkItemType: 'Task',
      completedWorkHours: 3.5,
    });
    const manualSubSub = mkItem({
      id: 'subsub-1',
      parentTaskId: 't-a',
      name: 'Write unit tests',
      depth: 2,
      completedWorkHours: 0,
    });
    const childTaskB = mkItem({
      id: 't-b',
      parentTaskId: 'story-1',
      name: 'UI Task',
      depth: 1,
      externalWorkItemId: '12',
      externalWorkItemType: 'Task',
      completedWorkHours: 1.25,
    });

    const tree = buildTaskTree([story, childTaskA, manualSubSub, childTaskB], 'p1');
    const rolled = buildEffectiveCompletedWorkMap(tree);

    expect(rolled.get('subsub-1')).toBe(0);
    expect(rolled.get('t-a')).toBe(3.5);
    expect(rolled.get('t-b')).toBe(1.25);
    expect(rolled.get('story-1')).toBe(4.75);
  });

  it('excludes unsupported ADO work items from push candidates and groups pushable children by parent', () => {
    const project = mkProj('p1', 'Core API');
    const conn: AdoConnectionSummary = {
      id: 'conn-1',
      organization: 'klox',
      orgUrl: 'https://dev.azure.com/klox',
      defaultProject: 'Core',
      kloxProjectId: 'p1',
      connected: true,
      defaultWorkItemType: 'Task',
      completedWorkFieldRef: 'Custom.ActualHours',
      connectedAt: '2026-11-27T00:00:00.000Z',
    };

    const pbi = mkItem({
      id: 'pbi-1',
      name: 'Checkout Epic',
      depth: 0,
      externalWorkItemId: '50',
      externalWorkItemType: 'Product Backlog Item',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: false,
    });
    const child1 = mkItem({
      id: 'c-1',
      parentTaskId: 'pbi-1',
      name: 'Stripe webhook',
      depth: 1,
      sortOrder: 100,
      externalWorkItemId: '51',
      externalWorkItemType: 'Task',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: true,
      completedWorkHours: 1,
    });
    const child2 = mkItem({
      id: 'c-2',
      parentTaskId: 'pbi-1',
      name: 'Invoice PDF',
      depth: 1,
      sortOrder: 200,
      externalWorkItemId: '52',
      externalWorkItemType: 'Task',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: true,
      completedWorkHours: 2,
    });
    const standaloneTask = mkItem({
      id: 'solo-1',
      name: 'Standalone Fix',
      depth: 0,
      externalWorkItemId: '60',
      externalWorkItemType: 'Task',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: true,
      completedWorkHours: 0.5,
    });
    const allTasks = [pbi, child1, child2, standaloneTask];

    const logs = [
      // Tracked directly on unsupported PBI — MUST NOT become push candidate
      mkTimeLog({ id: 'l-pbi', taskId: 'pbi-1', durationSeconds: 3600 }),
      mkTimeLog({ id: 'l-c1', taskId: 'c-1', durationSeconds: 5400 }), // 1.5h
      mkTimeLog({ id: 'l-c2', taskId: 'c-2', durationSeconds: 1800 }), // 0.5h
      mkTimeLog({ id: 'l-solo', taskId: 'solo-1', durationSeconds: 3600 }), // 1.0h
    ];

    const result = buildAdoSyncCandidates({
      projects: [project],
      tasks: allTasks,
      logs,
      connections: [conn],
      workItemTypesByConn: {
        'conn-1': [
          { name: 'Product Backlog Item', supportsCompletedWork: false },
          { name: 'Task', supportsCompletedWork: true },
        ],
      },
    });

    expect(result.readyItems.map((i) => i.workItemId)).toEqual([51, 60, 52]);
    expect(result.totalRecommendedHours).toBe(3);

    const groups = groupAdoSyncCandidatesByParent(result.readyItems, allTasks);
    expect(groups).toHaveLength(2);

    const parentGroup = groups.find((g) => g.parentTask?.id === 'pbi-1')!;
    expect(parentGroup.isParentContainer).toBe(true);
    expect(parentGroup.parentTask?.externalWorkItemId).toBe('50');
    expect(parentGroup.items.map((i) => i.workItemId)).toEqual([51, 52]);
    expect(parentGroup.totalRecommendedDeltaHours).toBe(2);
    expect(parentGroup.totalUnsyncedSeconds).toBe(7200);

    const soloGroup = groups.find((g) => g.parentTask === null)!;
    expect(soloGroup.isParentContainer).toBe(false);
    expect(soloGroup.items.map((i) => i.workItemId)).toEqual([60]);
  });

  it('computes project-scoped bulk task tag updates (add, remove, replace) and summarizes tag coverage', () => {
    const p1Tags: ProjectTag[] = [
      { id: 't1', userId: 'u1', projectId: 'p1', name: 'Backend' },
      { id: 't2', userId: 'u1', projectId: 'p1', name: 'Auth' },
      { id: 't3', userId: 'u1', projectId: 'p1', name: 'Urgent' },
      { id: 't-other', userId: 'u1', projectId: 'p2', name: 'Foreign' },
    ];

    // Add merges cleanly, preserves order, deduplicates, and rejects foreign-project tags
    expect(
      computeBulkTaskTagIds({
        currentTagIds: ['t1', 't-other'],
        targetTagIds: ['t2', 't1', 't-other'],
        mode: 'add',
        projectId: 'p1',
        allTags: p1Tags,
      })
    ).toEqual(['t1', 't2']);

    // Remove deletes target tags while preserving remaining tags
    expect(
      computeBulkTaskTagIds({
        currentTagIds: ['t1', 't2', 't3'],
        targetTagIds: ['t2'],
        mode: 'remove',
        projectId: 'p1',
        allTags: p1Tags,
      })
    ).toEqual(['t1', 't3']);

    // Replace overwrites or clears tags when target is empty
    expect(
      computeBulkTaskTagIds({
        currentTagIds: ['t1', 't2'],
        targetTagIds: ['t3', 't-other'],
        mode: 'replace',
        projectId: 'p1',
        allTags: p1Tags,
      })
    ).toEqual(['t3']);

    expect(
      computeBulkTaskTagIds({
        currentTagIds: ['t1', 't2'],
        targetTagIds: [],
        mode: 'replace',
        projectId: 'p1',
        allTags: p1Tags,
      })
    ).toEqual([]);

    const taskA = mkItem({ id: 'a', name: 'Task A', tagIds: ['t1', 't2'] });
    const taskB = mkItem({ id: 'b', name: 'Task B', tagIds: ['t1', 't3'] });
    expect(summarizeSelectedTaskTags([taskA, taskB])).toEqual({
      commonTagIds: ['t1'],
      partialTagIds: ['t2', 't3'],
    });
  });

  it('suggests creating child ADO Tasks under parent work items when allowParentTaskTracking is enabled', () => {
    const project = mkProj('p1', 'Core API');
    const conn: AdoConnectionSummary = {
      id: 'conn-1',
      organization: 'klox',
      orgUrl: 'https://dev.azure.com/klox',
      defaultProject: 'Core',
      kloxProjectId: 'p1',
      connected: true,
      defaultWorkItemType: 'Task',
      connectedAt: '2026-11-27T00:00:00.000Z',
    };

    const story = mkItem({
      id: 'story-1',
      name: 'Implement Checkout Flow',
      depth: 0,
      externalWorkItemId: '70',
      externalWorkItemType: 'User Story',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: false,
    });
    const existingChild = mkItem({
      id: 'child-1',
      parentTaskId: 'story-1',
      name: 'Backend Payment Webhook',
      depth: 1,
      externalWorkItemId: '71',
      externalWorkItemType: 'Task',
      externalOrgUrl: conn.orgUrl,
      externalProject: conn.defaultProject,
      externalSupportsCompletedWork: true,
    });

    const parentDirectLog = mkTimeLog({
      id: 'log-parent',
      taskId: 'story-1',
      description: 'Architecture alignment & pairing',
      durationSeconds: 5400, // 1.5h
    });
    const childLog = mkTimeLog({
      id: 'log-child',
      taskId: 'child-1',
      description: 'Webhook signature check',
      durationSeconds: 3600, // 1.0h
    });

    const typesByConn = {
      'conn-1': [
        { name: 'User Story', supportsCompletedWork: false },
        { name: 'Task', supportsCompletedWork: true },
      ],
    };

    // With allowParentTaskTracking disabled: direct parent hours do NOT suggest child Task
    const withoutFlag = buildAdoSyncCandidates({
      projects: [project],
      tasks: [story, existingChild],
      logs: [parentDirectLog, childLog],
      connections: [conn],
      allowParentTaskTracking: false,
      workItemTypesByConn: typesByConn,
    });
    expect(withoutFlag.readyItems.map((r) => r.workItemId)).toEqual([71]);
    expect(withoutFlag.suggestedChildTasks).toHaveLength(0);

    // With allowParentTaskTracking enabled: parent hours produce a suggested child Task under #70
    const withFlag = buildAdoSyncCandidates({
      projects: [project],
      tasks: [story, existingChild],
      logs: [parentDirectLog, childLog],
      connections: [conn],
      allowParentTaskTracking: true,
      workItemTypesByConn: typesByConn,
    });
    expect(withFlag.readyItems.map((r) => r.workItemId)).toEqual([71]);
    expect(withFlag.suggestedChildTasks).toHaveLength(1);
    expect(withFlag.suggestedChildTasks[0]).toMatchObject({
      parentTask: expect.objectContaining({ id: 'story-1' }),
      parentWorkItemId: 70,
      defaultWorkItemType: 'Task',
      suggestedTitle: 'Architecture alignment & pairing',
      recommendedHours: 1.5,
      unsyncedSeconds: 5400,
    });
    expect(withFlag.totalRecommendedHours).toBe(1);
    expect(withFlag.totalSuggestedChildHours).toBe(1.5);

    const groups = groupAdoSyncCandidatesByParent(
      withFlag.readyItems,
      [story, existingChild],
      withFlag.suggestedChildTasks
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.isParentContainer).toBe(true);
    expect(groups[0]!.items.map((i) => i.workItemId)).toEqual([71]);
    expect(groups[0]!.suggestedChildren).toHaveLength(1);
    expect(groups[0]!.totalRecommendedDeltaHours).toBe(2.5);
  });
});
