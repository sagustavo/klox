import {
  DEFAULT_ADO_COMPLETED_WORK_FIELD,
  buildAdoWorkItemWebUrl,
  normalizeAdoFieldRef,
  normalizeStoredAdoConnections,
  parseWorkItemIdInput,
  roundHours2,
  type AdoErrorCode,
  type AdoFieldOption,
  type AdoIterationInfo,
  type AdoSprintWorkItemNode,
  type AdoWorkItemSummary,
  type AdoWorkItemTypeCapability,
} from '~/domain/ado';
import { tenantStorageKey } from '~/domain/auth';
import { toDateKey } from '~/domain/duration';
import { publishDomainEvent } from '~/domain/events';
import type { AdoConnectionSummary, EntityId, TimeLogAdoSync } from '~/domain/types';
import { fetchAuthedApi } from '~/utils/apiAuth';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { useTimeLogsStore } from './timeLogs';

const DEMO_ADO_CONNS_KEY = 'klox_ado_demo_connections';
const DEMO_ADO_CONN_LEGACY_KEY = 'klox_ado_demo_connection';
const DEMO_ADO_ITEMS_KEY = 'klox_ado_demo_workitems';

const DEMO_NUMERIC_FIELDS: AdoFieldOption[] = [
  {
    referenceName: 'Microsoft.VSTS.Scheduling.CompletedWork',
    name: 'Completed Work',
    type: 'double',
  },
  {
    referenceName: 'Custom.ActualHours',
    name: 'Actual Hours',
    type: 'double',
  },
  {
    referenceName: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
    name: 'Original Estimate',
    type: 'double',
  },
];

function demoTypesForField(fieldRef?: string): AdoWorkItemTypeCapability[] {
  const isCustomField =
    Boolean(fieldRef?.trim()) &&
    fieldRef!.trim().toLowerCase() !== DEFAULT_ADO_COMPLETED_WORK_FIELD.toLowerCase();
  return [
    { name: 'Task', supportsCompletedWork: true },
    { name: 'Bug', supportsCompletedWork: true },
    { name: 'Product Backlog Item', supportsCompletedWork: isCustomField },
    { name: 'User Story', supportsCompletedWork: isCustomField },
  ];
}

export interface AdoProjectOption {
  id: string;
  name: string;
}

export interface AdoPushApprovalItem {
  connectionId?: string;
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
      workItemType: 'Product Backlog Item',
      completedWork: 0,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/31',
      supportsCompletedWork: false,
    },
    {
      id: 3101,
      title: 'Implement encrypted PAT vault & multi-project binding',
      workItemType: 'Task',
      completedWork: 2.5,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/3101',
      supportsCompletedWork: true,
    },
    {
      id: 3102,
      title: 'Build Sprint work item hierarchy importer',
      workItemType: 'Task',
      completedWork: 1.5,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/3102',
      supportsCompletedWork: true,
    },
    {
      id: 101,
      title: '[BUG-1] Refresh Firebase ID Token on 401',
      workItemType: 'Bug',
      completedWork: 0,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/101',
      supportsCompletedWork: true,
    },
    {
      id: 1011,
      title: 'Retry Nitro API calls with forced token refresh',
      workItemType: 'Task',
      completedWork: 1.0,
      url: 'https://dev.azure.com/klox-demo/Klox/_workitems/edit/1011',
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
  const connections = ref<AdoConnectionSummary[]>([]);
  const projects = ref<AdoProjectOption[]>([]);
  const workItemTypes = ref<AdoWorkItemTypeCapability[]>([]);
  const workItemTypesByConn = ref<Record<string, AdoWorkItemTypeCapability[]>>({});
  const numericFieldsByConn = ref<Record<string, AdoFieldOption[]>>({});
  const iterationsByConn = ref<Record<string, AdoIterationInfo[]>>({});
  const currentIterByConn = ref<Record<string, string | null>>({});
  const loading = ref(false);
  const syncing = ref(false);
  const hydratedUid = ref<string | null>(null);
  const demoWorkItems = ref<AdoWorkItemSummary[]>([]);

  // Backward-compatible primary connection & aggregate flag
  const connection = computed<AdoConnectionSummary | null>(() => connections.value[0] ?? null);
  const isConnected = computed(() => connections.value.some((c) => c.connected));

  function getConnectionById(connectionId?: string | null): AdoConnectionSummary | null {
    if (!connectionId) return connections.value[0] ?? null;
    return connections.value.find((c) => c.id === connectionId) ?? null;
  }

  function getConnectionForProject(kloxProjectId?: EntityId | null): AdoConnectionSummary | null {
    if (!kloxProjectId) return null;
    return connections.value.find((c) => c.connected && c.kloxProjectId === kloxProjectId) ?? null;
  }

  function loadDemoState(uid: string) {
    if (import.meta.server) return;
    try {
      const rawConns = localStorage.getItem(tenantStorageKey(DEMO_ADO_CONNS_KEY, uid));
      const rawLegacy = localStorage.getItem(tenantStorageKey(DEMO_ADO_CONN_LEGACY_KEY, uid));

      if (rawConns) {
        connections.value = normalizeStoredAdoConnections({
          adoConnections: JSON.parse(rawConns),
        });
      } else if (rawLegacy) {
        connections.value = normalizeStoredAdoConnections({
          adoConnection: JSON.parse(rawLegacy),
        });
      } else {
        connections.value = [];
      }

      const rawItems = localStorage.getItem(tenantStorageKey(DEMO_ADO_ITEMS_KEY, uid));
      demoWorkItems.value = rawItems
        ? (JSON.parse(rawItems) as AdoWorkItemSummary[])
        : createInitialDemoWorkItems();

      if (connections.value.length > 0) {
        projects.value = [
          { id: 'demo-klox', name: connections.value[0]?.defaultProject || 'Klox' },
          { id: 'demo-core', name: 'Core Platform' },
        ];
        const nextTypesByConn: Record<string, AdoWorkItemTypeCapability[]> = {};
        const nextFieldsByConn: Record<string, AdoFieldOption[]> = {};
        for (const conn of connections.value) {
          nextTypesByConn[conn.id] = demoTypesForField(conn.completedWorkFieldRef);
          nextFieldsByConn[conn.id] = [...DEMO_NUMERIC_FIELDS];
        }
        workItemTypesByConn.value = nextTypesByConn;
        numericFieldsByConn.value = nextFieldsByConn;
        workItemTypes.value = nextTypesByConn[connections.value[0]!.id] ?? demoTypesForField();
      } else {
        projects.value = [];
        workItemTypes.value = [];
        workItemTypesByConn.value = {};
        numericFieldsByConn.value = {};
      }
    } catch {
      connections.value = [];
      demoWorkItems.value = createInitialDemoWorkItems();
    }
  }

  function persistDemoState(uid: string) {
    if (import.meta.server) return;
    try {
      localStorage.setItem(
        tenantStorageKey(DEMO_ADO_CONNS_KEY, uid),
        JSON.stringify(connections.value)
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
    connections.value = [];
    projects.value = [];
    workItemTypes.value = [];
    workItemTypesByConn.value = {};
    numericFieldsByConn.value = {};
    iterationsByConn.value = {};
    currentIterByConn.value = {};
    loading.value = false;
    syncing.value = false;
    hydratedUid.value = null;
    demoWorkItems.value = [];
  }

  async function hydrate(uid: string, isDemo: boolean, force = false): Promise<void> {
    if (import.meta.server) return;
    if (!force && hydratedUid.value === uid) return;

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
        connections.value = normalizeStoredAdoConnections(
          snap.data() as { adoConnections?: unknown; adoConnection?: unknown } | undefined
        );
      }
    } catch (err) {
      console.warn('[Klox adoStore hydrate error]', err);
    } finally {
      loading.value = false;
    }
  }

  async function previewProjectsAndTypes(params: {
    isDemo: boolean;
    connectionId?: string;
    orgUrl: string;
    defaultProject?: string;
    completedWorkFieldRef?: string;
    pat?: string;
  }): Promise<{
    ok: boolean;
    projects: AdoProjectOption[];
    workItemTypes: AdoWorkItemTypeCapability[];
    numericFields: AdoFieldOption[];
    errorCode?: AdoErrorCode;
  }> {
    if (params.isDemo) {
      const demoProjects = [
        { id: 'demo-klox', name: params.defaultProject?.trim() || 'Klox' },
        { id: 'demo-core', name: 'Core Platform' },
      ];
      const demoTypes = demoTypesForField(params.completedWorkFieldRef);
      const demoFields = [...DEMO_NUMERIC_FIELDS];
      projects.value = demoProjects;
      workItemTypes.value = demoTypes;
      if (params.connectionId) {
        workItemTypesByConn.value = {
          ...workItemTypesByConn.value,
          [params.connectionId]: demoTypes,
        };
        numericFieldsByConn.value = {
          ...numericFieldsByConn.value,
          [params.connectionId]: demoFields,
        };
      }
      return { ok: true, projects: demoProjects, workItemTypes: demoTypes, numericFields: demoFields };
    }

    loading.value = true;
    try {
      const res = await fetchAuthedApi<{
        projects: AdoProjectOption[];
        workItemTypes: AdoWorkItemTypeCapability[];
        numericFields?: AdoFieldOption[];
      }>('/api/integrations/ado/connection', {
        method: 'POST',
        body: {
          previewOnly: true,
          orgUrl: params.orgUrl,
          ...(params.connectionId ? { connectionId: params.connectionId } : {}),
          ...(params.defaultProject?.trim() ? { defaultProject: params.defaultProject.trim() } : {}),
          ...(params.completedWorkFieldRef?.trim()
            ? { completedWorkFieldRef: params.completedWorkFieldRef.trim() }
            : {}),
          ...(params.pat?.trim() ? { pat: params.pat.trim() } : {}),
        },
      });
      projects.value = res.projects ?? [];
      workItemTypes.value = res.workItemTypes ?? [];
      const fields = res.numericFields ?? [];
      if (params.connectionId) {
        workItemTypesByConn.value = {
          ...workItemTypesByConn.value,
          [params.connectionId]: workItemTypes.value,
        };
        numericFieldsByConn.value = {
          ...numericFieldsByConn.value,
          [params.connectionId]: fields,
        };
      }
      return {
        ok: true,
        projects: projects.value,
        workItemTypes: workItemTypes.value,
        numericFields: fields,
      };
    } catch (err) {
      return {
        ok: false,
        projects: projects.value,
        workItemTypes: workItemTypes.value,
        numericFields: [],
        errorCode: extractApiErrorCode(err),
      };
    } finally {
      loading.value = false;
    }
  }

  async function saveConnection(params: {
    uid: string;
    isDemo: boolean;
    connectionId?: string;
    kloxProjectId: EntityId;
    orgUrl: string;
    defaultProject: string;
    defaultWorkItemType: string;
    completedWorkFieldRef?: string;
    pat?: string;
  }): Promise<{ ok: boolean; connection?: AdoConnectionSummary; errorCode?: AdoErrorCode }> {
    loading.value = true;
    try {
      if (!params.kloxProjectId?.trim()) {
        return { ok: false, errorCode: 'ADO_INVALID_INPUT' };
      }

      const fieldCheck = normalizeAdoFieldRef(params.completedWorkFieldRef);
      if (!fieldCheck.valid) {
        return { ok: false, errorCode: fieldCheck.error };
      }
      const activeFieldRef = fieldCheck.fieldRef;

      if (params.isDemo) {
        const nowIso = new Date().toISOString();
        const orgSlug =
          params.orgUrl.replace(/^https?:\/\/dev\.azure\.com\//i, '').split('/')[0] ||
          'klox-demo';
        const effectiveId =
          params.connectionId && params.connectionId !== 'legacy_default'
            ? params.connectionId
            : `demo_ado_${Date.now().toString(36)}`;

        const duplicate = connections.value.find(
          (c) =>
            c.kloxProjectId === params.kloxProjectId &&
            c.id !== effectiveId &&
            c.id !== params.connectionId
        );
        if (duplicate) {
          return { ok: false, errorCode: 'ADO_PROJECT_ALREADY_BOUND' };
        }

        const prev = connections.value.find(
          (c) => c.id === effectiveId || c.id === params.connectionId
        );

        const nextConn: AdoConnectionSummary = {
          id: effectiveId,
          kloxProjectId: params.kloxProjectId,
          connected: true,
          authType: 'pat',
          orgUrl: `https://dev.azure.com/${orgSlug}`,
          organization: orgSlug,
          defaultProject: params.defaultProject.trim() || 'Klox',
          defaultWorkItemType: params.defaultWorkItemType.trim() || 'Task',
          ...(activeFieldRef !== DEFAULT_ADO_COMPLETED_WORK_FIELD
            ? { completedWorkFieldRef: activeFieldRef }
            : {}),
          tokenHint: params.pat?.trim()
            ? `••••${params.pat.trim().slice(-4)}`
            : prev?.tokenHint || '••••demo',
          connectedAt: prev?.connectedAt ?? nowIso,
          lastVerifiedAt: nowIso,
        };

        connections.value = [
          ...connections.value.filter(
            (c) => c.id !== effectiveId && c.id !== params.connectionId && c.id !== 'legacy_default'
          ),
          nextConn,
        ];

        if (demoWorkItems.value.length === 0) {
          demoWorkItems.value = createInitialDemoWorkItems();
        }
        projects.value = [
          { id: 'demo-klox', name: nextConn.defaultProject },
          { id: 'demo-core', name: 'Core Platform' },
        ];
        const demoTypes = demoTypesForField(activeFieldRef);
        workItemTypes.value = demoTypes;
        workItemTypesByConn.value = {
          ...workItemTypesByConn.value,
          [effectiveId]: demoTypes,
        };
        numericFieldsByConn.value = {
          ...numericFieldsByConn.value,
          [effectiveId]: [...DEMO_NUMERIC_FIELDS],
        };
        persistDemoState(params.uid);
        publishDomainEvent({ type: 'AdoConnected', at: nowIso });
        return { ok: true, connection: nextConn };
      }

      const res = await fetchAuthedApi<{
        connection: AdoConnectionSummary;
        connections: AdoConnectionSummary[];
        projects: AdoProjectOption[];
        workItemTypes: AdoWorkItemTypeCapability[];
        numericFields?: AdoFieldOption[];
      }>('/api/integrations/ado/connection', {
        method: 'POST',
        body: {
          ...(params.connectionId ? { connectionId: params.connectionId } : {}),
          kloxProjectId: params.kloxProjectId,
          orgUrl: params.orgUrl,
          defaultProject: params.defaultProject,
          defaultWorkItemType: params.defaultWorkItemType,
          completedWorkFieldRef: activeFieldRef,
          ...(params.pat?.trim() ? { pat: params.pat.trim() } : {}),
        },
      });

      connections.value = res.connections ?? [res.connection];
      projects.value = res.projects ?? [];
      workItemTypes.value = res.workItemTypes ?? [];
      workItemTypesByConn.value = {
        ...workItemTypesByConn.value,
        [res.connection.id]: workItemTypes.value,
      };
      numericFieldsByConn.value = {
        ...numericFieldsByConn.value,
        [res.connection.id]: res.numericFields ?? [],
      };
      publishDomainEvent({ type: 'AdoConnected', at: new Date().toISOString() });
      return { ok: true, connection: res.connection };
    } catch (err) {
      return { ok: false, errorCode: extractApiErrorCode(err) };
    } finally {
      loading.value = false;
    }
  }

  async function enableDemoConnection(
    uid: string,
    kloxProjectId?: EntityId
  ): Promise<{ ok: boolean; errorCode?: AdoErrorCode }> {
    const catalogStore = useCatalogStore();
    let targetProjectId = kloxProjectId;
    if (!targetProjectId) {
      const candidate = catalogStore.sortedProjects.find((p) => p.systemKey !== 'unassigned');
      if (candidate) {
        targetProjectId = candidate.id;
      } else {
        const created = await catalogStore.createProject({
          uid,
          isDemo: true,
          name: 'Klox Engineering',
          isBillableDefault: true,
        });
        targetProjectId = created.id;
      }
    }

    const res = await saveConnection({
      uid,
      isDemo: true,
      kloxProjectId: targetProjectId,
      orgUrl: 'https://dev.azure.com/klox-demo',
      defaultProject: 'Klox',
      defaultWorkItemType: 'Task',
      pat: 'demo-simulated-token',
    });
    return { ok: res.ok, errorCode: res.errorCode };
  }

  async function disconnectConnection(params: {
    uid: string;
    isDemo: boolean;
    connectionId: string;
  }): Promise<void> {
    loading.value = true;
    try {
      if (params.isDemo) {
        connections.value = connections.value.filter((c) => c.id !== params.connectionId);
        if (connections.value.length === 0) {
          projects.value = [];
          workItemTypes.value = [];
        }
        persistDemoState(params.uid);
      } else {
        const res = await fetchAuthedApi<{ ok: boolean; connections: AdoConnectionSummary[] }>(
          '/api/integrations/ado/connection',
          {
            method: 'DELETE',
            query: { connectionId: params.connectionId },
          }
        );
        connections.value = res.connections ?? [];
        if (connections.value.length === 0) {
          projects.value = [];
          workItemTypes.value = [];
        }
      }
      const nextIters = { ...iterationsByConn.value };
      delete nextIters[params.connectionId];
      iterationsByConn.value = nextIters;
      publishDomainEvent({ type: 'AdoDisconnected', at: new Date().toISOString() });
    } finally {
      loading.value = false;
    }
  }

  async function disconnect(params: { uid: string; isDemo: boolean; connectionId?: string }): Promise<void> {
    const id = params.connectionId ?? connections.value[0]?.id;
    if (!id) return;
    await disconnectConnection({ uid: params.uid, isDemo: params.isDemo, connectionId: id });
  }

  async function fetchProjectsAndTypes(params: {
    isDemo: boolean;
    connectionId?: string;
    orgUrl?: string;
    project?: string;
    completedWorkFieldRef?: string;
  }): Promise<{
    projects: AdoProjectOption[];
    workItemTypes: AdoWorkItemTypeCapability[];
    numericFields: AdoFieldOption[];
    errorCode?: AdoErrorCode;
  }> {
    const conn = params.connectionId ? getConnectionById(params.connectionId) : connection.value;
    const fieldRef = params.completedWorkFieldRef ?? conn?.completedWorkFieldRef;

    if (params.isDemo) {
      const types = demoTypesForField(fieldRef);
      const fields = [...DEMO_NUMERIC_FIELDS];
      workItemTypes.value = types;
      if (conn) {
        workItemTypesByConn.value = { ...workItemTypesByConn.value, [conn.id]: types };
        numericFieldsByConn.value = { ...numericFieldsByConn.value, [conn.id]: fields };
      }
      return { projects: projects.value, workItemTypes: types, numericFields: fields };
    }
    try {
      const res = await fetchAuthedApi<{
        projects: AdoProjectOption[];
        workItemTypes: AdoWorkItemTypeCapability[];
        numericFields?: AdoFieldOption[];
      }>('/api/integrations/ado/projects', {
        query: {
          ...(params.connectionId ? { connectionId: params.connectionId } : {}),
          ...(params.orgUrl ? { orgUrl: params.orgUrl } : {}),
          ...(params.project ? { project: params.project } : {}),
          ...(fieldRef ? { completedWorkFieldRef: fieldRef } : {}),
        },
      });
      projects.value = res.projects ?? [];
      workItemTypes.value = res.workItemTypes ?? [];
      const fields = res.numericFields ?? [];
      if (conn) {
        workItemTypesByConn.value = {
          ...workItemTypesByConn.value,
          [conn.id]: workItemTypes.value,
        };
        numericFieldsByConn.value = {
          ...numericFieldsByConn.value,
          [conn.id]: fields,
        };
      }
      return {
        projects: projects.value,
        workItemTypes: workItemTypes.value,
        numericFields: fields,
      };
    } catch (err) {
      return {
        projects: projects.value,
        workItemTypes: workItemTypes.value,
        numericFields: conn ? numericFieldsByConn.value[conn.id] ?? [] : [],
        errorCode: extractApiErrorCode(err),
      };
    }
  }

  async function fetchIterations(params: {
    isDemo: boolean;
    connectionId: string;
    timeZone?: string;
  }): Promise<{
    iterations: AdoIterationInfo[];
    currentIterationPath: string | null;
    errorCode?: AdoErrorCode;
  }> {
    const conn = getConnectionById(params.connectionId);
    if (!conn) {
      return { iterations: [], currentIterationPath: null, errorCode: 'ADO_CONNECTION_NOT_FOUND' };
    }

    if (params.isDemo) {
      const todayKey = toDateKey(new Date(), params.timeZone || 'UTC');
      const baseProject = conn.defaultProject || 'Klox';
      const demoIters: AdoIterationInfo[] = [
        {
          id: 9,
          name: 'Sprint 3',
          displayPath: 'Sprint 3',
          iterationPath: `${baseProject}\\Sprint 3`,
          startDate: '2026-01-01T00:00:00Z',
          finishDate: '2026-01-14T00:00:00Z',
          timeFrame: 'past',
        },
        {
          id: 10,
          name: 'Sprint 4',
          displayPath: 'Sprint 4',
          iterationPath: `${baseProject}\\Sprint 4`,
          startDate: `${todayKey}T00:00:00Z`,
          finishDate: `${todayKey}T23:59:59Z`,
          timeFrame: 'current',
        },
        {
          id: 11,
          name: 'Sprint 5',
          displayPath: 'Sprint 5',
          iterationPath: `${baseProject}\\Sprint 5`,
          startDate: '2099-01-01T00:00:00Z',
          finishDate: '2099-01-14T00:00:00Z',
          timeFrame: 'future',
        },
      ];
      iterationsByConn.value = {
        ...iterationsByConn.value,
        [conn.id]: demoIters,
      };
      currentIterByConn.value = {
        ...currentIterByConn.value,
        [conn.id]: demoIters[1]!.iterationPath,
      };
      return {
        iterations: demoIters,
        currentIterationPath: demoIters[1]!.iterationPath,
      };
    }

    try {
      const res = await fetchAuthedApi<{
        iterations: AdoIterationInfo[];
        currentIterationPath: string | null;
      }>('/api/integrations/ado/iterations', {
        query: {
          connectionId: conn.id,
          ...(params.timeZone ? { timeZone: params.timeZone } : {}),
        },
      });
      iterationsByConn.value = {
        ...iterationsByConn.value,
        [conn.id]: res.iterations ?? [],
      };
      currentIterByConn.value = {
        ...currentIterByConn.value,
        [conn.id]: res.currentIterationPath ?? null,
      };
      return {
        iterations: res.iterations ?? [],
        currentIterationPath: res.currentIterationPath ?? null,
      };
    } catch (err) {
      return {
        iterations: iterationsByConn.value[conn.id] ?? [],
        currentIterationPath: currentIterByConn.value[conn.id] ?? null,
        errorCode: extractApiErrorCode(err),
      };
    }
  }

  async function previewSprintWorkItems(params: {
    isDemo: boolean;
    connectionId: string;
    iterationPath?: string;
    timeZone?: string;
  }): Promise<{
    ok: boolean;
    orgUrl: string;
    project: string;
    iterationPath: string;
    iterationName: string;
    items: AdoSprintWorkItemNode[];
    errorCode?: AdoErrorCode;
  }> {
    const conn = getConnectionById(params.connectionId);
    if (!conn || !conn.kloxProjectId) {
      return {
        ok: false,
        orgUrl: '',
        project: '',
        iterationPath: '',
        iterationName: '',
        items: [],
        errorCode: 'ADO_NOT_CONNECTED',
      };
    }

    const orgUrl = conn.orgUrl;
    const project = conn.defaultProject;

    if (params.isDemo) {
      if (demoWorkItems.value.length === 0) {
        demoWorkItems.value = createInitialDemoWorkItems();
      }
      const pbi31 = demoWorkItems.value.find((w) => w.id === 31);
      const t3101 = demoWorkItems.value.find((w) => w.id === 3101);
      const t3102 = demoWorkItems.value.find((w) => w.id === 3102);
      const b101 = demoWorkItems.value.find((w) => w.id === 101);
      const t1011 = demoWorkItems.value.find((w) => w.id === 1011);

      const items: AdoSprintWorkItemNode[] = [
        ...(pbi31
          ? [
              {
                id: pbi31.id,
                parentId: null,
                depth: 0 as const,
                title: pbi31.title,
                workItemType: pbi31.workItemType,
                completedWork: pbi31.completedWork,
                supportsCompletedWork: pbi31.supportsCompletedWork,
                url: buildAdoWorkItemWebUrl(orgUrl, project, pbi31.id),
                assignedToMe: true,
              },
            ]
          : []),
        ...(t3101
          ? [
              {
                id: t3101.id,
                parentId: 31,
                depth: 1 as const,
                title: t3101.title,
                workItemType: t3101.workItemType,
                completedWork: t3101.completedWork,
                supportsCompletedWork: t3101.supportsCompletedWork,
                url: buildAdoWorkItemWebUrl(orgUrl, project, t3101.id),
                assignedToMe: true,
              },
            ]
          : []),
        ...(t3102
          ? [
              {
                id: t3102.id,
                parentId: 31,
                depth: 1 as const,
                title: t3102.title,
                workItemType: t3102.workItemType,
                completedWork: t3102.completedWork,
                supportsCompletedWork: t3102.supportsCompletedWork,
                url: buildAdoWorkItemWebUrl(orgUrl, project, t3102.id),
                assignedToMe: true,
              },
            ]
          : []),
        ...(b101
          ? [
              {
                id: b101.id,
                parentId: null,
                depth: 0 as const,
                title: b101.title,
                workItemType: b101.workItemType,
                completedWork: b101.completedWork,
                supportsCompletedWork: b101.supportsCompletedWork,
                url: buildAdoWorkItemWebUrl(orgUrl, project, b101.id),
                assignedToMe: true,
              },
            ]
          : []),
        ...(t1011
          ? [
              {
                id: t1011.id,
                parentId: 101,
                depth: 1 as const,
                title: t1011.title,
                workItemType: t1011.workItemType,
                completedWork: t1011.completedWork,
                supportsCompletedWork: t1011.supportsCompletedWork,
                url: buildAdoWorkItemWebUrl(orgUrl, project, t1011.id),
                assignedToMe: true,
              },
            ]
          : []),
      ];

      const resolvedPath = params.iterationPath || `${project}\\Sprint 4`;
      const resolvedName = resolvedPath.split('\\').pop() || 'Sprint 4';
      return {
        ok: true,
        orgUrl,
        project,
        iterationPath: resolvedPath,
        iterationName: resolvedName,
        items,
      };
    }

    try {
      const res = await fetchAuthedApi<{
        orgUrl: string;
        project: string;
        iterationPath: string;
        iterationName: string;
        items: AdoSprintWorkItemNode[];
      }>('/api/integrations/ado/sprint-items', {
        method: 'POST',
        body: {
          connectionId: conn.id,
          ...(params.iterationPath ? { iterationPath: params.iterationPath } : {}),
          ...(params.timeZone ? { timeZone: params.timeZone } : {}),
        },
      });
      return {
        ok: true,
        orgUrl: res.orgUrl,
        project: res.project,
        iterationPath: res.iterationPath,
        iterationName: res.iterationName,
        items: res.items ?? [],
      };
    } catch (err) {
      return {
        ok: false,
        orgUrl,
        project,
        iterationPath: params.iterationPath || '',
        iterationName: '',
        items: [],
        errorCode: extractApiErrorCode(err),
      };
    }
  }

  async function commitSprintWorkItems(params: {
    uid: string;
    isDemo: boolean;
    connectionId: string;
    orgUrl: string;
    project: string;
    iterationName?: string;
    nodes: readonly AdoSprintWorkItemNode[];
  }): Promise<{
    ok: boolean;
    createdCount: number;
    updatedCount: number;
    errorCode?: AdoErrorCode;
  }> {
    const conn = getConnectionById(params.connectionId);
    if (!conn || !conn.kloxProjectId) {
      return { ok: false, createdCount: 0, updatedCount: 0, errorCode: 'ADO_NOT_CONNECTED' };
    }

    const catalogStore = useCatalogStore();
    const counts = await catalogStore.upsertAdoSprintTasksBatch({
      uid: params.uid,
      isDemo: params.isDemo,
      projectId: conn.kloxProjectId,
      orgUrl: params.orgUrl,
      adoProject: params.project,
      nodes: params.nodes,
    });

    publishDomainEvent({
      type: 'AdoSprintImported',
      at: new Date().toISOString(),
      projectId: conn.kloxProjectId,
      count: counts.createdCount + counts.updatedCount,
    });

    return {
      ok: true,
      createdCount: counts.createdCount,
      updatedCount: counts.updatedCount,
    };
  }

  async function importSprintWorkItems(params: {
    uid: string;
    isDemo: boolean;
    connectionId: string;
    iterationPath?: string;
    timeZone?: string;
  }): Promise<{
    ok: boolean;
    createdCount: number;
    updatedCount: number;
    totalFetched: number;
    iterationName?: string;
    errorCode?: AdoErrorCode;
  }> {
    const preview = await previewSprintWorkItems({
      isDemo: params.isDemo,
      connectionId: params.connectionId,
      iterationPath: params.iterationPath,
      timeZone: params.timeZone,
    });
    if (!preview.ok) {
      return {
        ok: false,
        createdCount: 0,
        updatedCount: 0,
        totalFetched: 0,
        errorCode: preview.errorCode,
      };
    }

    const committed = await commitSprintWorkItems({
      uid: params.uid,
      isDemo: params.isDemo,
      connectionId: params.connectionId,
      orgUrl: preview.orgUrl,
      project: preview.project,
      iterationName: preview.iterationName,
      nodes: preview.items,
    });

    return {
      ok: committed.ok,
      createdCount: committed.createdCount,
      updatedCount: committed.updatedCount,
      totalFetched: preview.items.length,
      iterationName: preview.iterationName,
      errorCode: committed.errorCode,
    };
  }

  async function searchWorkItems(params: {
    isDemo: boolean;
    connectionId?: string;
    kloxProjectId?: string;
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
            ...(params.connectionId ? { connectionId: params.connectionId } : {}),
            ...(params.kloxProjectId ? { kloxProjectId: params.kloxProjectId } : {}),
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
    targets: ReadonlyArray<{
      connectionId?: string;
      orgUrl?: string;
      project?: string;
      ids: number[];
    }>;
  }): Promise<{
    items: Array<AdoWorkItemSummary & { orgUrl: string; project: string }>;
    errorCode?: AdoErrorCode;
  }> {
    if (!isConnected.value || params.targets.length === 0) {
      return { items: [] };
    }

    const catalogStore = useCatalogStore();
    const nowIso = new Date().toISOString();

    let pulled: Array<AdoWorkItemSummary & { orgUrl: string; project: string }> = [];

    if (params.isDemo) {
      const fallbackConn = connection.value!;
      for (const group of params.targets) {
        const groupConn = getConnectionById(group.connectionId) ?? fallbackConn;
        const orgUrl = group.orgUrl || groupConn.orgUrl;
        const proj = group.project || groupConn.defaultProject;
        for (const id of group.ids) {
          const found = demoWorkItems.value.find((w) => w.id === id);
          if (found) {
            pulled.push({
              ...found,
              orgUrl,
              project: proj,
              url: buildAdoWorkItemWebUrl(orgUrl, proj, found.id),
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
            externalSupportsCompletedWork: match.supportsCompletedWork,
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
    connectionId?: string;
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
    const catalogStore = useCatalogStore();
    const timeLogsStore = useTimeLogsStore();
    const task = catalogStore.getTaskById(params.taskId);
    if (!task) return { ok: false, errorCode: 'ADO_NOT_FOUND' };

    const activeConn =
      getConnectionById(params.connectionId) ??
      getConnectionForProject(task.projectId) ??
      connection.value;
    if (!activeConn?.connected) {
      return { ok: false, errorCode: 'ADO_NOT_CONNECTED' };
    }

    const targetOrg = params.orgUrl?.trim() || activeConn.orgUrl;
    const targetProject = params.project?.trim() || activeConn.defaultProject;
    const nowIso = new Date().toISOString();

    let createdItem: AdoWorkItemSummary;

    if (params.isDemo) {
      const maxId = demoWorkItems.value.reduce((m, w) => Math.max(m, w.id), 100);
      const nextId = maxId + 1;
      const demoCaps =
        workItemTypesByConn.value[activeConn.id] ??
        demoTypesForField(activeConn.completedWorkFieldRef);
      const matchedCap = demoCaps.find(
        (wt) => wt.name.toLowerCase() === params.workItemType.toLowerCase()
      );
      const supportsCompletedWork = matchedCap
        ? matchedCap.supportsCompletedWork
        : params.workItemType.toLowerCase() !== 'product backlog item' &&
          params.workItemType.toLowerCase() !== 'user story';
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
            connectionId: activeConn.id,
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
      externalSupportsCompletedWork: createdItem.supportsCompletedWork,
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

  /**
   * Creates a new child ADO Work Item under `parentWorkItemId`, persists a mirrored
   * child `Task` under `parentTaskId` in Klox, and reassigns + marks the parent's tracked
   * activities as synced against the new child Work Item.
   */
  async function createChildWorkItemForParentLogs(params: {
    uid: string;
    isDemo: boolean;
    connectionId?: string;
    parentTaskId: EntityId;
    parentWorkItemId: number;
    orgUrl?: string;
    project?: string;
    workItemType: string;
    title: string;
    initialCompletedWork: number;
    logIds: readonly EntityId[];
  }): Promise<{
    ok: boolean;
    item?: AdoWorkItemSummary & { orgUrl: string; project: string };
    errorCode?: AdoErrorCode;
  }> {
    const catalogStore = useCatalogStore();
    const timeLogsStore = useTimeLogsStore();
    const parentTask = catalogStore.getTaskById(params.parentTaskId);
    if (!parentTask) return { ok: false, errorCode: 'ADO_NOT_FOUND' };

    const cleanTitle = params.title.trim();
    if (!cleanTitle) return { ok: false, errorCode: 'ADO_INVALID_INPUT' };

    const activeConn =
      getConnectionById(params.connectionId) ??
      getConnectionForProject(parentTask.projectId) ??
      connection.value;
    if (!activeConn?.connected) {
      return { ok: false, errorCode: 'ADO_NOT_CONNECTED' };
    }

    const targetOrg = params.orgUrl?.trim() || activeConn.orgUrl;
    const targetProject = params.project?.trim() || activeConn.defaultProject;
    const nowIso = new Date().toISOString();

    let createdItem: AdoWorkItemSummary;

    if (params.isDemo) {
      const maxId = demoWorkItems.value.reduce((m, w) => Math.max(m, w.id), 100);
      const nextId = maxId + 1;
      const demoCaps =
        workItemTypesByConn.value[activeConn.id] ??
        demoTypesForField(activeConn.completedWorkFieldRef);
      const matchedCap = demoCaps.find(
        (wt) => wt.name.toLowerCase() === params.workItemType.toLowerCase()
      );
      const supportsCompletedWork = matchedCap
        ? matchedCap.supportsCompletedWork
        : params.workItemType.toLowerCase() !== 'product backlog item' &&
          params.workItemType.toLowerCase() !== 'user story';
      createdItem = {
        id: nextId,
        title: cleanTitle,
        workItemType: params.workItemType,
        completedWork:
          supportsCompletedWork && params.initialCompletedWork > 0
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
            connectionId: activeConn.id,
            orgUrl: targetOrg,
            project: targetProject,
            workItemType: params.workItemType,
            title: cleanTitle,
            initialCompletedWork: params.initialCompletedWork,
            parentWorkItemId: params.parentWorkItemId,
          },
        });
        createdItem = res.item;
      } catch (err) {
        return { ok: false, errorCode: extractApiErrorCode(err) };
      }
    }

    const targetParentTaskId =
      (parentTask.depth ?? 0) < 2 ? parentTask.id : (parentTask.parentTaskId ?? null);

    const createdKloxTask = await catalogStore.createTask({
      uid: params.uid,
      isDemo: params.isDemo,
      projectId: parentTask.projectId,
      parentTaskId: targetParentTaskId,
      name: createdItem.title,
      externalWorkItemId: String(createdItem.id),
      externalWorkItemTitle: createdItem.title,
      externalWorkItemType: createdItem.workItemType,
      externalWorkItemUrl: createdItem.url,
      externalOrgUrl: targetOrg,
      externalProject: targetProject,
      externalSupportsCompletedWork: createdItem.supportsCompletedWork,
      completedWorkHours: createdItem.completedWork,
      externalSyncedAt: nowIso,
    });

    if (params.logIds.length > 0 && createdItem.supportsCompletedWork) {
      const logSet = new Set(params.logIds);
      const syncMarks = timeLogsStore.logs
        .filter((l) => logSet.has(l.id))
        .map((l) => ({
          logId: l.id,
          reassignTaskId: createdKloxTask.id,
          reassignTaskNameSnapshot: createdKloxTask.name,
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
    if (!isConnected.value) {
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
                ...(a.connectionId ? { connectionId: a.connectionId } : {}),
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
    connections,
    connection,
    projects,
    workItemTypes,
    workItemTypesByConn,
    numericFieldsByConn,
    iterationsByConn,
    currentIterByConn,
    loading,
    syncing,
    isConnected,
    getConnectionById,
    getConnectionForProject,
    hydrate,
    reset,
    previewProjectsAndTypes,
    saveConnection,
    connectPat: saveConnection,
    enableDemoConnection,
    disconnectConnection,
    disconnect,
    fetchProjectsAndTypes,
    fetchIterations,
    previewSprintWorkItems,
    commitSprintWorkItems,
    importSprintWorkItems,
    searchWorkItems,
    pullWorkItems,
    createWorkItemForTask,
    createChildWorkItemForParentLogs,
    pushApprovedHours,
  };
});
