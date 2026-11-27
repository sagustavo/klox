import {
  buildAdoWorkItemWebUrl,
  parseWorkItemIdInput,
  roundHours2,
  type AdoErrorCode,
  type AdoWorkItemSummary,
  type AdoWorkItemTypeCapability,
} from '~/domain/ado';
import { tenantStorageKey } from '~/domain/auth';
import { publishDomainEvent } from '~/domain/events';
import type { AdoConnectionSummary, EntityId, TimeLogAdoSync } from '~/domain/types';
import { fetchAuthedApi } from '~/utils/apiAuth';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { useTimeLogsStore } from './timeLogs';

const DEMO_ADO_CONN_KEY = 'klox_ado_demo_connection';
const DEMO_ADO_ITEMS_KEY = 'klox_ado_demo_workitems';

export interface AdoProjectOption {
  id: string;
  name: string;
}

export interface AdoPushApprovalItem {
  workItemId: number;
  orgUrl: string;
  project: string;
  approvedDeltaHours: number;
  taskIds: EntityId[];
  logIds: EntityId[];
}

export interface AdoPushExecutionResult {
  workItemId: number;
  orgUrl: string;
  project: string;
  ok: boolean;
  title?: string;
  workItemType?: string;
  previousCompletedWork?: number;
  newCompletedWork?: number;
  url?: string;
  errorCode?: AdoErrorCode;
}

function createInitialDemoWorkItems(): AdoWorkItemSummary[] {
  return [
    {
      id: 31,
      title: '[FR-V1] Azure DevOps Work Item Sync (CompletedWork)',
      workItemType: 'Task',
      completedWork: 4.5,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/31',
      supportsCompletedWork: true,
    },
    {
      id: 101,
      title: 'API Gateway Rate Limiter & Token Refresh',
      workItemType: 'Task',
      completedWork: 2.0,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/101',
      supportsCompletedWork: true,
    },
    {
      id: 102,
      title: 'OAuth Linking Telemetry Audit',
      workItemType: 'Task',
      completedWork: 1.25,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/102',
      supportsCompletedWork: true,
    },
  ];
}

function extractApiErrorCode(err: unknown): AdoErrorCode {
  const dataCode = (err as { data?: { data?: { code?: string }; code?: string }; statusMessage?: string })
    ?.data?.data?.code;
  const directCode = (err as { data?: { code?: string } })?.data?.code;
  const statusMsg = (err as { statusMessage?: string })?.statusMessage;
  const candidate = dataCode || directCode || statusMsg;
  if (candidate && (candidate === 'AUTH_INVALID' || candidate.startsWith('ADO_'))) {
    return candidate as AdoErrorCode;
  }
  return 'ADO_UNAVAILABLE';
}

export const useAdoStore = defineStore('ado', () => {
  const connection = ref<AdoConnectionSummary | null>(null);
  const projects = ref<AdoProjectOption[]>([]);
  const workItemTypes = ref<AdoWorkItemTypeCapability[]>([]);
  const loading = ref(false);
  const syncing = ref(false);
  const hydratedUid = ref<string | null>(null);
  const demoWorkItems = ref<AdoWorkItemSummary[]>([]);

  const isConnected = computed(() => Boolean(connection.value?.connected));

  function loadDemoState(uid: string) {
    if (import.meta.server) return;
    try {
      const rawConn = localStorage.getItem(tenantStorageKey(DEMO_ADO_CONN_KEY, uid));
      connection.value = rawConn ? (JSON.parse(rawConn) as AdoConnectionSummary) : null;
      const rawItems = localStorage.getItem(tenantStorageKey(DEMO_ADO_ITEMS_KEY, uid));
      demoWorkItems.value = rawItems
        ? (JSON.parse(rawItems) as AdoWorkItemSummary[])
        : createInitialDemoWorkItems();
      if (connection.value?.connected) {
        projects.value = [
          { id: 'demo-klox', name: connection.value.defaultProject || 'Klox' },
          { id: 'demo-core', name: 'Core Platform' },
        ];
        workItemTypes.value = [
          { name: 'Task', supportsCompletedWork: true },
          { name: 'Bug', supportsCompletedWork: true },
          { name: 'Product Backlog Item', supportsCompletedWork: false },
        ];
      } else {
        projects.value = [];
        workItemTypes.value = [];
      }
    } catch {
      connection.value = null;
      demoWorkItems.value = createInitialDemoWorkItems();
    }
  }

  function persistDemoState(uid: string) {
    if (import.meta.server) return;
    try {
      localStorage.setItem(
        tenantStorageKey(DEMO_ADO_CONN_KEY, uid),
        JSON.stringify(connection.value)
      );
      localStorage.setItem(
        tenantStorageKey(DEMO_ADO_ITEMS_KEY, uid),
        JSON.stringify(demoWorkItems.value)
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  function reset() {
    connection.value = null;
    projects.value = [];
    workItemTypes.value = [];
    loading.value = false;
    syncing.value = false;
    hydratedUid.value = null;
    demoWorkItems.value = [];
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    if (hydratedUid.value === uid) return;

    hydratedUid.value = uid;
    if (isDemo) {
      loadDemoState(uid);
      return;
    }

    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(fb.db, 'users', uid));
        const conn = snap.data()?.adoConnection as AdoConnectionSummary | undefined;
        connection.value = conn?.connected ? conn : null;
      }
    } catch (err) {
      console.warn('[Klox adoStore hydrate error]', err);
    } finally {
      loading.value = false;
    }
  }

  async function connectPat(params: {
    uid: string;
    isDemo: boolean;
    orgUrl: string;
    defaultProject: string;
    defaultWorkItemType: string;
    pat?: string;
  }): Promise<{ ok: boolean; errorCode?: AdoErrorCode }> {
    loading.value = true;
    try {
      if (params.isDemo) {
        const nowIso = new Date().toISOString();
        const orgSlug =
          params.orgUrl.replace(/^https?:\/\/dev\.azure\.com\//i, '').split('/')[0] ||
          'klox-demo';
        connection.value = {
          connected: true,
          authType: 'pat',
          orgUrl: `https://dev.azure.com/${orgSlug}`,
          organization: orgSlug,
          defaultProject: params.defaultProject.trim() || 'Klox',
          defaultWorkItemType: params.defaultWorkItemType.trim() || 'Task',
          tokenHint: '••••demo',
          connectedAt: connection.value?.connectedAt ?? nowIso,
          lastVerifiedAt: nowIso,
        };
        if (demoWorkItems.value.length === 0) {
          demoWorkItems.value = createInitialDemoWorkItems();
        }
        projects.value = [
          { id: 'demo-klox', name: connection.value.defaultProject },
          { id: 'demo-core', name: 'Core Platform' },
        ];
        workItemTypes.value = [
          { name: 'Task', supportsCompletedWork: true },
          { name: 'Bug', supportsCompletedWork: true },
          { name: 'Product Backlog Item', supportsCompletedWork: false },
        ];
        persistDemoState(params.uid);
        publishDomainEvent({ type: 'AdoConnected', at: nowIso });
        return { ok: true };
      }

      const res = await fetchAuthedApi<{
        connection: AdoConnectionSummary;
        projects: AdoProjectOption[];
        workItemTypes: AdoWorkItemTypeCapability[];
      }>('/api/integrations/ado/connection', {
        method: 'POST',
        body: {
          orgUrl: params.orgUrl,
          defaultProject: params.defaultProject,
          defaultWorkItemType: params.defaultWorkItemType,
          ...(params.pat?.trim() ? { pat: params.pat.trim() } : {}),
        },
      });

      connection.value = res.connection;
      projects.value = res.projects ?? [];
      workItemTypes.value = res.workItemTypes ?? [];
      publishDomainEvent({ type: 'AdoConnected', at: new Date().toISOString() });
      return { ok: true };
    } catch (err) {
      return { ok: false, errorCode: extractApiErrorCode(err) };
    } finally {
      loading.value = false;
    }
  }

  async function enableDemoConnection(uid: string): Promise<{ ok: boolean }> {
    const res = await connectPat({
      uid,
      isDemo: true,
      orgUrl: 'https://dev.azure.com/klox-demo',
      defaultProject: 'Klox',
      defaultWorkItemType: 'Task',
      pat: 'demo-simulated-token',
    });
    return { ok: res.ok };
  }

  async function disconnect(params: { uid: string; isDemo: boolean }): Promise<void> {
    loading.value = true;
    try {
      if (params.isDemo) {
        connection.value = null;
        projects.value = [];
        workItemTypes.value = [];
        persistDemoState(params.uid);
      } else {
        await fetchAuthedApi('/api/integrations/ado/connection', {
          method: 'DELETE',
        });
        connection.value = null;
        projects.value = [];
        workItemTypes.value = [];
      }
      publishDomainEvent({ type: 'AdoDisconnected', at: new Date().toISOString() });
    } finally {
      loading.value = false;
    }
  }

  async function fetchProjectsAndTypes(params: {
    isDemo: boolean;
    orgUrl?: string;
    project?: string;
  }): Promise<{
    projects: AdoProjectOption[];
    workItemTypes: AdoWorkItemTypeCapability[];
    errorCode?: AdoErrorCode;
  }> {
    if (params.isDemo) {
      return { projects: projects.value, workItemTypes: workItemTypes.value };
    }
    try {
      const res = await fetchAuthedApi<{
        projects: AdoProjectOption[];
        workItemTypes: AdoWorkItemTypeCapability[];
      }>('/api/integrations/ado/projects', {
        query: {
          ...(params.orgUrl ? { orgUrl: params.orgUrl } : {}),
          ...(params.project ? { project: params.project } : {}),
        },
      });
      projects.value = res.projects ?? [];
      workItemTypes.value = res.workItemTypes ?? [];
      return {
        projects: projects.value,
        workItemTypes: workItemTypes.value,
      };
    } catch (err) {
      return {
        projects: projects.value,
        workItemTypes: workItemTypes.value,
        errorCode: extractApiErrorCode(err),
      };
    }
  }

  async function searchWorkItems(params: {
    isDemo: boolean;
    orgUrl?: string;
    project?: string;
    query: string;
  }): Promise<{ items: AdoWorkItemSummary[]; errorCode?: AdoErrorCode }> {
    if (params.isDemo) {
      const q = params.query.trim().toLowerCase();
      const idNum = parseWorkItemIdInput(params.query);
      const items = demoWorkItems.value.filter((item) => {
        if (idNum !== null) return item.id === idNum;
        if (!q) return true;
        return item.title.toLowerCase().includes(q) || String(item.id).includes(q);
      });
      return { items };
    }

    try {
      const res = await fetchAuthedApi<{ items: AdoWorkItemSummary[] }>(
        '/api/integrations/ado/search',
        {
          method: 'POST',
          body: {
            orgUrl: params.orgUrl,
            project: params.project,
            query: params.query,
            top: 20,
          },
        }
      );
      return { items: res.items ?? [] };
    } catch (err) {
      return { items: [], errorCode: extractApiErrorCode(err) };
    }
  }

  async function pullWorkItems(params: {
    uid: string;
    isDemo: boolean;
    targets: ReadonlyArray<{ orgUrl?: string; project?: string; ids: number[] }>;
  }): Promise<{
    items: Array<AdoWorkItemSummary & { orgUrl: string; project: string }>;
    errorCode?: AdoErrorCode;
  }> {
    if (!connection.value?.connected || params.targets.length === 0) {
      return { items: [] };
    }

    const catalogStore = useCatalogStore();
    const nowIso = new Date().toISOString();

    let pulled: Array<AdoWorkItemSummary & { orgUrl: string; project: string }> = [];

    if (params.isDemo) {
      const orgUrl = connection.value.orgUrl;
      const defaultProj = connection.value.defaultProject;
      for (const group of params.targets) {
        const proj = group.project || defaultProj;
        for (const id of group.ids) {
          const found = demoWorkItems.value.find((w) => w.id === id);
          if (found) {
            pulled.push({
              ...found,
              orgUrl: group.orgUrl || orgUrl,
              project: proj,
              url: buildAdoWorkItemWebUrl(group.orgUrl || orgUrl, proj, found.id),
            });
          }
        }
      }
    } else {
      try {
        const res = await fetchAuthedApi<{
          items: Array<AdoWorkItemSummary & { orgUrl: string; project: string }>;
        }>('/api/integrations/ado/pull', {
          method: 'POST',
          body: { targets: params.targets },
        });
        pulled = res.items ?? [];
      } catch (err) {
        return { items: [], errorCode: extractApiErrorCode(err) };
      }
    }

    if (pulled.length > 0) {
      const byId = new Map(pulled.map((i) => [i.id, i]));
      const patches = catalogStore.tasks
        .filter((t) => t.externalProvider === 'azure_devops' && t.externalWorkItemId)
        .map((t) => {
          const parsedId = parseWorkItemIdInput(t.externalWorkItemId);
          const match = parsedId ? byId.get(parsedId) : undefined;
          if (!match) return null;
          return {
            taskId: t.id,
            externalWorkItemTitle: match.title,
            externalWorkItemType: match.workItemType,
            externalWorkItemUrl: match.url,
            externalOrgUrl: match.orgUrl,
            externalProject: match.project,
            completedWorkHours: match.completedWork,
            externalSyncedAt: nowIso,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (patches.length > 0) {
        await catalogStore.applyTasksAdoSnapshotBatch({
          uid: params.uid,
          isDemo: params.isDemo,
          patches,
        });
      }
    }

    return { items: pulled };
  }

  async function createWorkItemForTask(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
    orgUrl?: string;
    project?: string;
    workItemType: string;
    title: string;
    initialCompletedWork?: number;
    initialLogIds?: readonly EntityId[];
  }): Promise<{
    ok: boolean;
    item?: AdoWorkItemSummary & { orgUrl: string; project: string };
    errorCode?: AdoErrorCode;
  }> {
    if (!connection.value?.connected) {
      return { ok: false, errorCode: 'ADO_NOT_CONNECTED' };
    }

    const catalogStore = useCatalogStore();
    const timeLogsStore = useTimeLogsStore();
    const task = catalogStore.getTaskById(params.taskId);
    if (!task) return { ok: false, errorCode: 'ADO_NOT_FOUND' };

    const targetOrg = params.orgUrl?.trim() || connection.value.orgUrl;
    const targetProject = params.project?.trim() || connection.value.defaultProject;
    const nowIso = new Date().toISOString();

    let createdItem: AdoWorkItemSummary;

    if (params.isDemo) {
      const maxId = demoWorkItems.value.reduce((m, w) => Math.max(m, w.id), 100);
      const nextId = maxId + 1;
      const supportsCompletedWork =
        params.workItemType.toLowerCase() !== 'product backlog item';
      createdItem = {
        id: nextId,
        title: params.title.trim(),
        workItemType: params.workItemType,
        completedWork:
          supportsCompletedWork && params.initialCompletedWork
            ? roundHours2(params.initialCompletedWork)
            : 0,
        url: buildAdoWorkItemWebUrl(targetOrg, targetProject, nextId),
        supportsCompletedWork,
      };
      demoWorkItems.value = [createdItem, ...demoWorkItems.value];
      persistDemoState(params.uid);
    } else {
      try {
        const res = await fetchAuthedApi<{
          orgUrl: string;
          project: string;
          item: AdoWorkItemSummary;
        }>('/api/integrations/ado/work-items', {
          method: 'POST',
          body: {
            orgUrl: targetOrg,
            project: targetProject,
            workItemType: params.workItemType,
            title: params.title,
            initialCompletedWork: params.initialCompletedWork,
          },
        });
        createdItem = res.item;
      } catch (err) {
        return { ok: false, errorCode: extractApiErrorCode(err) };
      }
    }

    await catalogStore.updateTask({
      uid: params.uid,
      isDemo: params.isDemo,
      taskId: task.id,
      name: task.name,
      description: task.description,
      targetHours: task.targetHours ?? null,
      externalWorkItemId: String(createdItem.id),
      externalWorkItemTitle: createdItem.title,
      externalWorkItemType: createdItem.workItemType,
      externalWorkItemUrl: createdItem.url,
      externalOrgUrl: targetOrg,
      externalProject: targetProject,
      completedWorkHours: createdItem.completedWork,
      externalSyncedAt: nowIso,
    });

    if (
      params.initialCompletedWork &&
      params.initialCompletedWork > 0 &&
      createdItem.supportsCompletedWork &&
      params.initialLogIds &&
      params.initialLogIds.length > 0
    ) {
      const logSet = new Set(params.initialLogIds);
      const syncMarks = timeLogsStore.logs
        .filter((l) => logSet.has(l.id))
        .map((l) => ({
          logId: l.id,
          adoSync: {
            workItemId: createdItem.id,
            orgUrl: targetOrg,
            project: targetProject,
            syncedSeconds: l.durationSeconds,
            syncedAt: nowIso,
          } satisfies TimeLogAdoSync,
        }));
      await timeLogsStore.markLogsAdoSyncedBatch({
        uid: params.uid,
        isDemo: params.isDemo,
        items: syncMarks,
      });
    }

    publishDomainEvent({
      type: 'AdoWorkItemLinked',
      at: nowIso,
      workItemId: createdItem.id,
      createdNew: true,
    });

    return {
      ok: true,
      item: {
        ...createdItem,
        orgUrl: targetOrg,
        project: targetProject,
      },
    };
  }

  async function pushApprovedHours(params: {
    uid: string;
    isDemo: boolean;
    approvals: readonly AdoPushApprovalItem[];
  }): Promise<{ results: AdoPushExecutionResult[]; errorCode?: AdoErrorCode }> {
    if (!connection.value?.connected) {
      return { results: [], errorCode: 'ADO_NOT_CONNECTED' };
    }
    if (params.approvals.length === 0) {
      return { results: [] };
    }

    const catalogStore = useCatalogStore();
    const timeLogsStore = useTimeLogsStore();
    const nowIso = new Date().toISOString();

    syncing.value = true;
    try {
      let results: AdoPushExecutionResult[] = [];

      if (params.isDemo) {
        results = params.approvals.map((appItem) => {
          const found = demoWorkItems.value.find((w) => w.id === appItem.workItemId);
          if (!found) {
            return {
              workItemId: appItem.workItemId,
              orgUrl: appItem.orgUrl,
              project: appItem.project,
              ok: false,
              errorCode: 'ADO_NOT_FOUND',
            };
          }
          if (!found.supportsCompletedWork) {
            return {
              workItemId: appItem.workItemId,
              orgUrl: appItem.orgUrl,
              project: appItem.project,
              ok: false,
              title: found.title,
              workItemType: found.workItemType,
              previousCompletedWork: found.completedWork,
              errorCode: 'ADO_COMPLETED_WORK_UNSUPPORTED',
            };
          }
          const prev = found.completedWork;
          const next = roundHours2(prev + appItem.approvedDeltaHours);
          found.completedWork = next;
          return {
            workItemId: found.id,
            orgUrl: appItem.orgUrl,
            project: appItem.project,
            ok: true,
            title: found.title,
            workItemType: found.workItemType,
            previousCompletedWork: prev,
            newCompletedWork: next,
            url: buildAdoWorkItemWebUrl(appItem.orgUrl, appItem.project, found.id),
          };
        });
        persistDemoState(params.uid);
      } else {
        const res = await fetchAuthedApi<{ results: AdoPushExecutionResult[] }>(
          '/api/integrations/ado/push',
          {
            method: 'POST',
            body: {
              items: params.approvals.map((a) => ({
                orgUrl: a.orgUrl,
                project: a.project,
                workItemId: a.workItemId,
                approvedDeltaHours: a.approvedDeltaHours,
              })),
            },
          }
        );
        results = res.results ?? [];
      }

      const approvalByItem = new Map(
        params.approvals.map((a) => [
          `${a.orgUrl.toLowerCase()}::${a.project.toLowerCase()}::${a.workItemId}`,
          a,
        ])
      );

      const logSyncMarks: Array<{ logId: EntityId; adoSync: TimeLogAdoSync }> = [];
      const taskPatches: Array<{
        taskId: EntityId;
        externalWorkItemTitle?: string;
        externalWorkItemType?: string;
        externalWorkItemUrl?: string;
        externalOrgUrl?: string;
        externalProject?: string;
        completedWorkHours?: number;
        externalSyncedAt?: string;
      }> = [];

      let succeededCount = 0;
      let totalHoursPushed = 0;

      for (const resItem of results) {
        if (!resItem.ok) continue;
        succeededCount += 1;
        const key = `${resItem.orgUrl.toLowerCase()}::${resItem.project.toLowerCase()}::${resItem.workItemId}`;
        const approval = approvalByItem.get(key);
        if (!approval) continue;

        totalHoursPushed = roundHours2(totalHoursPushed + approval.approvedDeltaHours);

        const logIdSet = new Set(approval.logIds);
        for (const l of timeLogsStore.logs) {
          if (!logIdSet.has(l.id)) continue;
          logSyncMarks.push({
            logId: l.id,
            adoSync: {
              workItemId: resItem.workItemId,
              orgUrl: resItem.orgUrl,
              project: resItem.project,
              syncedSeconds: l.durationSeconds,
              syncedAt: nowIso,
            },
          });
        }

        for (const taskId of approval.taskIds) {
          taskPatches.push({
            taskId,
            externalWorkItemTitle: resItem.title,
            externalWorkItemType: resItem.workItemType,
            externalWorkItemUrl: resItem.url,
            externalOrgUrl: resItem.orgUrl,
            externalProject: resItem.project,
            completedWorkHours: resItem.newCompletedWork,
            externalSyncedAt: nowIso,
          });
        }
      }

      await Promise.all([
        timeLogsStore.markLogsAdoSyncedBatch({
          uid: params.uid,
          isDemo: params.isDemo,
          items: logSyncMarks,
        }),
        catalogStore.applyTasksAdoSnapshotBatch({
          uid: params.uid,
          isDemo: params.isDemo,
          patches: taskPatches,
        }),
      ]);

      if (succeededCount > 0) {
        publishDomainEvent({
          type: 'AdoHoursSynced',
          at: nowIso,
          workItemCount: succeededCount,
          totalHours: totalHoursPushed,
        });
      }

      return { results };
    } catch (err) {
      return { results: [], errorCode: extractApiErrorCode(err) };
    } finally {
      syncing.value = false;
    }
  }

  return {
    connection,
    projects,
    workItemTypes,
    loading,
    syncing,
    isConnected,
    hydrate,
    reset,
    connectPat,
    enableDemoConnection,
    disconnect,
    fetchProjectsAndTypes,
    searchWorkItems,
    pullWorkItems,
    createWorkItemForTask,
    pushApprovedHours,
  };
});
