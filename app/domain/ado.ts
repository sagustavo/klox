/**
 * Pure domain helpers for Azure DevOps Work Item Sync (AB#31 / FR-V1 / ADR-0015).
 * Zero Vue or Firebase imports allowed.
 */
import { MAX_TASK_DEPTH, UNASSIGNED_PROJECT_ID, formatTaskHierarchyLabel } from './invariants';
import type {
  AdoConnectionSummary,
  EntityId,
  Project,
  Task,
  TimeLog,
} from './types';

export type AdoErrorCode =
  | 'AUTH_INVALID'
  | 'ADO_INVALID_ORG_URL'
  | 'ADO_INVALID_INPUT'
  | 'ADO_NOT_CONNECTED'
  | 'ADO_AUTH_FAILED'
  | 'ADO_FORBIDDEN'
  | 'ADO_NOT_FOUND'
  | 'ADO_RATE_LIMITED'
  | 'ADO_COMPLETED_WORK_UNSUPPORTED'
  | 'ADO_CONFLICT'
  | 'ADO_FIRESTORE_PERMISSION_DENIED'
  | 'ADO_SERVER_MISCONFIGURED'
  | 'ADO_UNAVAILABLE';

export interface AdoWorkItemSummary {
  id: number;
  title: string;
  workItemType: string;
  completedWork: number;
  url: string;
  supportsCompletedWork: boolean;
}

export interface AdoWorkItemTypeCapability {
  name: string;
  supportsCompletedWork: boolean;
}

export interface EffectiveProjectAdoTarget {
  enabled: boolean;
  orgUrl: string;
  organization: string;
  project: string;
  defaultWorkItemType: string;
}

export interface AdoSyncLogContribution {
  log: TimeLog;
  unsyncedSeconds: number;
}

export interface AdoSyncCandidate {
  key: string;
  workItemId: number;
  orgUrl: string;
  project: string;
  tasks: Task[];
  primaryTask: Task;
  hierarchicalTaskLabel: string;
  projectName: string;
  projectColor: string;
  logs: AdoSyncLogContribution[];
  unsyncedSeconds: number;
  recommendedDeltaHours: number;
  alreadySyncedSeconds: number;
  cachedTitle?: string;
  cachedWorkItemType?: string;
  cachedCompletedWork: number;
  cachedUrl?: string;
}

export interface UnplannedAdoTaskCandidate {
  task: Task;
  hierarchicalTaskLabel: string;
  projectName: string;
  projectColor: string;
  target: EffectiveProjectAdoTarget;
  logs: TimeLog[];
  totalSeconds: number;
  recommendedHours: number;
}

export interface AdoSyncCandidatesResult {
  readyItems: AdoSyncCandidate[];
  unplannedTasks: UnplannedAdoTaskCandidate[];
  totalUnsyncedSeconds: number;
  totalRecommendedHours: number;
}

const ORG_SLUG_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function roundHours2(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 100) / 100;
}

export function secondsToHours2(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return roundHours2(seconds / 3600);
}

/**
 * Validates and canonicalizes an Azure DevOps organization URL or org slug.
 * Strictly allows `https://dev.azure.com/{org}` and legacy `https://{org}.visualstudio.com`
 * to prevent SSRF against internal or arbitrary hosts.
 */
export function normalizeAdoOrgUrl(
  raw: string
):
  | { valid: true; orgUrl: string; organization: string }
  | { valid: false; error: 'ADO_INVALID_ORG_URL' } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }

  // Allow shorthand org slug e.g. "klox"
  if (!trimmed.includes('://') && !trimmed.includes('/') && !trimmed.includes('.')) {
    if (ORG_SLUG_REGEX.test(trimmed)) {
      return {
        valid: true,
        orgUrl: `https://dev.azure.com/${trimmed}`,
        organization: trimmed,
      };
    }
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }
  if (parsed.username || parsed.password || parsed.port) {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }
  if (parsed.search || parsed.hash) {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || IPV4_REGEX.test(host) || host.includes(':')) {
    return { valid: false, error: 'ADO_INVALID_ORG_URL' };
  }

  if (host === 'dev.azure.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const org = segments[0] ?? '';
    if (!ORG_SLUG_REGEX.test(org)) {
      return { valid: false, error: 'ADO_INVALID_ORG_URL' };
    }
    return {
      valid: true,
      orgUrl: `https://dev.azure.com/${org}`,
      organization: org,
    };
  }

  if (host.endsWith('.visualstudio.com')) {
    const org = host.slice(0, -'.visualstudio.com'.length);
    if (!ORG_SLUG_REGEX.test(org)) {
      return { valid: false, error: 'ADO_INVALID_ORG_URL' };
    }
    return {
      valid: true,
      orgUrl: `https://dev.azure.com/${org}`,
      organization: org,
    };
  }

  return { valid: false, error: 'ADO_INVALID_ORG_URL' };
}

/**
 * Extracts a positive integer Work Item ID from `"31"`, `"#31"`, `"AB#31"`,
 * or full Azure DevOps edit URLs.
 */
export function parseWorkItemIdInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const directMatch = trimmed.match(/^(?:AB#?|#)?(\d{1,9})$/i);
  if (directMatch?.[1]) {
    const id = Number(directMatch[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  try {
    const url = new URL(trimmed);
    const editMatch = url.pathname.match(/\/_workitems\/edit\/(\d{1,9})(?:\/|$)/i);
    if (editMatch?.[1]) {
      const id = Number(editMatch[1]);
      return Number.isInteger(id) && id > 0 ? id : null;
    }
    const queryId = url.searchParams.get('id');
    if (queryId && /^\d{1,9}$/.test(queryId)) {
      const id = Number(queryId);
      return Number.isInteger(id) && id > 0 ? id : null;
    }
  } catch {
    // Not a URL
  }

  return null;
}

/**
 * Escapes WIQL string literals and strips control characters to prevent WIQL injection.
 */
export function escapeWiqlLiteral(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/'/g, "''")
    .trim();
}

export function buildAdoWorkItemWebUrl(
  orgUrl: string,
  project: string,
  workItemId: number
): string {
  const norm = normalizeAdoOrgUrl(orgUrl);
  const base = norm.valid ? norm.orgUrl : orgUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(project)}/_workitems/edit/${workItemId}`;
}

/**
 * Resolves the effective Azure DevOps target for a Klox Project, combining workspace defaults
 * with optional per-Project overrides (`Project.adoConfig`).
 */
export function resolveEffectiveProjectAdoTarget(
  project: Project | undefined,
  connection: AdoConnectionSummary | null
): EffectiveProjectAdoTarget | null {
  if (!connection?.connected) return null;

  const isUnassigned =
    !project || project.systemKey === 'unassigned' || project.id === UNASSIGNED_PROJECT_ID;
  const cfg = project?.adoConfig ?? null;

  const enabled = cfg ? cfg.enabled : !isUnassigned;
  if (!enabled) {
    return {
      enabled: false,
      orgUrl: connection.orgUrl,
      organization: connection.organization,
      project: connection.defaultProject,
      defaultWorkItemType: connection.defaultWorkItemType || 'Task',
    };
  }

  const rawOrg = cfg?.orgUrl?.trim() || connection.orgUrl;
  const norm = normalizeAdoOrgUrl(rawOrg);
  const orgUrl = norm.valid ? norm.orgUrl : connection.orgUrl;
  const organization = norm.valid ? norm.organization : connection.organization;
  const targetProject = cfg?.project?.trim() || connection.defaultProject;
  const defaultWorkItemType = cfg?.defaultWorkItemType?.trim() || connection.defaultWorkItemType || 'Task';

  if (!targetProject) return null;

  return {
    enabled: true,
    orgUrl,
    organization,
    project: targetProject,
    defaultWorkItemType,
  };
}

/**
 * Walks `Task -> parentTaskId` up to `MAX_TASK_DEPTH` (2) and returns the nearest task
 * linked to an Azure DevOps Work Item. Ensures subtasks without their own `#ID` roll up to
 * a linked parent while subtasks with an independent `#ID` never double-count.
 */
export function resolveControllingAdoTask(
  taskId: EntityId | undefined,
  allTasks: readonly Task[]
): Task | null {
  if (!taskId) return null;
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  let current = byId.get(taskId);
  const visited = new Set<EntityId>();
  let steps = 0;

  while (current && !visited.has(current.id) && steps <= MAX_TASK_DEPTH + 1) {
    visited.add(current.id);
    if (
      current.externalProvider === 'azure_devops' &&
      parseWorkItemIdInput(current.externalWorkItemId) !== null
    ) {
      return current;
    }
    if (!current.parentTaskId) break;
    const parent = byId.get(current.parentTaskId);
    if (!parent || parent.projectId !== current.projectId) break;
    current = parent;
    steps += 1;
  }

  return null;
}

/**
 * Computes remaining unsynced seconds on a single Activity (`TimeLog`) for a specific ADO Work Item target.
 */
export function computeLogUnsyncedSeconds(
  log: TimeLog,
  target: { workItemId: number; orgUrl: string; project: string }
): number {
  if (log.durationSeconds <= 0) return 0;
  const prev = log.adoSync;
  if (!prev) return log.durationSeconds;

  const sameWorkItem = prev.workItemId === target.workItemId;
  const sameOrg = prev.orgUrl.toLowerCase() === target.orgUrl.toLowerCase();
  const sameProject = prev.project.toLowerCase() === target.project.toLowerCase();

  if (!sameWorkItem || !sameOrg || !sameProject) {
    return log.durationSeconds;
  }

  return Math.max(0, log.durationSeconds - prev.syncedSeconds);
}

/**
 * Aggregates all unsynced Activities by target Azure DevOps Work Item (with nearest-ancestor Task roll-up)
 * plus unlinked Tasks in ADO-enabled Projects that already have logged Activities.
 */
export function buildAdoSyncCandidates(params: {
  projects: readonly Project[];
  tasks: readonly Task[];
  logs: readonly TimeLog[];
  connection: AdoConnectionSummary | null;
  filterProjectId?: EntityId;
}): AdoSyncCandidatesResult {
  const { projects, tasks, logs, connection, filterProjectId } = params;
  if (!connection?.connected) {
    return {
      readyItems: [],
      unplannedTasks: [],
      totalUnsyncedSeconds: 0,
      totalRecommendedHours: 0,
    };
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const readyByKey = new Map<string, AdoSyncCandidate>();
  const unplannedByTaskId = new Map<EntityId, UnplannedAdoTaskCandidate>();

  for (const log of logs) {
    if (!log.taskId || log.durationSeconds <= 0) continue;
    if (filterProjectId && log.projectId !== filterProjectId) continue;

    const leafTask = taskById.get(log.taskId);
    if (!leafTask) continue;

    const project = projectById.get(leafTask.projectId);
    const target = resolveEffectiveProjectAdoTarget(project, connection);
    if (!target || !target.enabled) continue;

    const controllingTask = resolveControllingAdoTask(leafTask.id, tasks);

    if (controllingTask) {
      const workItemId = parseWorkItemIdInput(controllingTask.externalWorkItemId);
      if (!workItemId) continue;

      const orgUrl = controllingTask.externalOrgUrl?.trim() || target.orgUrl;
      const adoProject = controllingTask.externalProject?.trim() || target.project;
      const unsynced = computeLogUnsyncedSeconds(log, {
        workItemId,
        orgUrl,
        project: adoProject,
      });
      if (unsynced <= 0) continue;

      const key = `${orgUrl.toLowerCase()}::${adoProject.toLowerCase()}::${workItemId}`;
      let bucket = readyByKey.get(key);
      if (!bucket) {
        bucket = {
          key,
          workItemId,
          orgUrl,
          project: adoProject,
          tasks: [controllingTask],
          primaryTask: controllingTask,
          hierarchicalTaskLabel: formatTaskHierarchyLabel(controllingTask, tasks),
          projectName: project?.name ?? log.projectNameSnapshot,
          projectColor: project?.color ?? log.projectColorSnapshot,
          logs: [],
          unsyncedSeconds: 0,
          recommendedDeltaHours: 0,
          alreadySyncedSeconds: 0,
          cachedTitle: controllingTask.externalWorkItemTitle,
          cachedWorkItemType: controllingTask.externalWorkItemType,
          cachedCompletedWork: controllingTask.completedWorkHours || 0,
          cachedUrl:
            controllingTask.externalWorkItemUrl ||
            buildAdoWorkItemWebUrl(orgUrl, adoProject, workItemId),
        };
        readyByKey.set(key, bucket);
      } else if (!bucket.tasks.some((t) => t.id === controllingTask.id)) {
        bucket.tasks.push(controllingTask);
      }

      bucket.logs.push({ log, unsyncedSeconds: unsynced });
      bucket.unsyncedSeconds += unsynced;
      bucket.alreadySyncedSeconds +=
        log.adoSync &&
        log.adoSync.workItemId === workItemId &&
        log.adoSync.project.toLowerCase() === adoProject.toLowerCase()
          ? log.adoSync.syncedSeconds
          : 0;
    } else {
      let unplanned = unplannedByTaskId.get(leafTask.id);
      if (!unplanned) {
        unplanned = {
          task: leafTask,
          hierarchicalTaskLabel: formatTaskHierarchyLabel(leafTask, tasks),
          projectName: project?.name ?? log.projectNameSnapshot,
          projectColor: project?.color ?? log.projectColorSnapshot,
          target,
          logs: [],
          totalSeconds: 0,
          recommendedHours: 0,
        };
        unplannedByTaskId.set(leafTask.id, unplanned);
      }
      unplanned.logs.push(log);
      unplanned.totalSeconds += log.durationSeconds;
    }
  }

  const readyItems = Array.from(readyByKey.values())
    .map((item) => ({
      ...item,
      recommendedDeltaHours: secondsToHours2(item.unsyncedSeconds),
    }))
    .filter((item) => item.unsyncedSeconds > 0)
    .sort((a, b) => b.unsyncedSeconds - a.unsyncedSeconds || a.workItemId - b.workItemId);

  const unplannedTasks = Array.from(unplannedByTaskId.values())
    .map((item) => ({
      ...item,
      recommendedHours: secondsToHours2(item.totalSeconds),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  const totalUnsyncedSeconds = readyItems.reduce((sum, item) => sum + item.unsyncedSeconds, 0);

  return {
    readyItems,
    unplannedTasks,
    totalUnsyncedSeconds,
    totalRecommendedHours: secondsToHours2(totalUnsyncedSeconds),
  };
}
