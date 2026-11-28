/**
 * Pure domain helpers for Azure DevOps Work Item Sync (AB#31 / FR-V1 / ADR-0015).
 * Zero Vue or Firebase imports allowed.
 */
import {
  MAX_TASK_DEPTH,
  UNASSIGNED_PROJECT_ID,
  compareTasksByPriority,
  formatTaskHierarchyLabel,
  type TaskTreeNode,
} from './invariants';
import { normalizeTaskTrackingPolicy } from './preferences';
import type {
  AdoConnectionSummary,
  EntityId,
  Project,
  Task,
  TaskTrackingPolicy,
  TimeLog,
} from './types';

export const LEGACY_ADO_CONNECTION_ID = 'legacy_default';
export const DEFAULT_ADO_COMPLETED_WORK_FIELD = 'Microsoft.VSTS.Scheduling.CompletedWork';
const ADO_FIELD_REF_REGEX = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const NON_COMPLETED_WORK_CONTAINER_TYPES = new Set([
  'product backlog item',
  'user story',
  'feature',
  'epic',
  'issue',
  'impediment',
  'test case',
]);

export type AdoErrorCode =
  | 'AUTH_INVALID'
  | 'ADO_INVALID_ORG_URL'
  | 'ADO_INVALID_INPUT'
  | 'ADO_PROJECT_ALREADY_BOUND'
  | 'ADO_CONNECTION_NOT_FOUND'
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

export type AdoWorkItemTypeKind =
  | 'bug'
  | 'pbi'
  | 'user_story'
  | 'task'
  | 'feature'
  | 'epic'
  | 'issue'
  | 'test_case'
  | 'other';

export interface AdoWorkItemTypeVisual {
  kind: AdoWorkItemTypeKind;
  shortLabel: string;
  fullName: string;
}

export type AdoIterationTimeFrame = 'past' | 'current' | 'future' | 'unscheduled';

export interface AdoIterationInfo {
  id: number;
  name: string;
  displayPath: string;
  iterationPath: string;
  startDate?: string;
  finishDate?: string;
  timeFrame: AdoIterationTimeFrame;
}

export interface AdoSprintWorkItemNode {
  id: number;
  parentId: number | null;
  depth: 0 | 1;
  title: string;
  workItemType: string;
  completedWork: number;
  supportsCompletedWork: boolean;
  url: string;
  assignedToMe: boolean;
}

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

export interface AdoFieldOption {
  referenceName: string;
  name: string;
  type: 'double' | 'integer';
}

export type TaskTimerBlockReason = 'PARENT_HAS_SUBTASKS' | 'ADO_COMPLETED_WORK_UNSUPPORTED';

export interface TaskTimerEligibility {
  allowed: boolean;
  reason: TaskTimerBlockReason | null;
}

export interface EffectiveProjectAdoTarget {
  connectionId: EntityId;
  enabled: boolean;
  orgUrl: string;
  organization: string;
  project: string;
  defaultWorkItemType: string;
  completedWorkFieldRef: string;
}

export interface AdoSyncLogContribution {
  log: TimeLog;
  unsyncedSeconds: number;
  sourceTaskId: EntityId;
  sourceTaskLabel: string;
  isRolledUpFromDescendant: boolean;
}

export interface AdoSyncCandidate {
  key: string;
  connectionId: EntityId;
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

export interface SuggestedChildAdoTaskCandidate {
  key: string;
  connectionId: string;
  parentTask: Task;
  parentWorkItemId: number;
  parentWorkItemType?: string;
  parentWorkItemTitle?: string;
  parentWorkItemUrl?: string;
  orgUrl: string;
  project: string;
  defaultWorkItemType: string;
  projectName: string;
  projectColor: string;
  suggestedTitle: string;
  logs: TimeLog[];
  unsyncedSeconds: number;
  recommendedHours: number;
}

export interface AdoSyncCandidatesResult {
  readyItems: AdoSyncCandidate[];
  unplannedTasks: UnplannedAdoTaskCandidate[];
  suggestedChildTasks: SuggestedChildAdoTaskCandidate[];
  totalUnsyncedSeconds: number;
  totalRecommendedHours: number;
  totalSuggestedChildHours: number;
}

const ORG_SLUG_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function normalizeAdoFieldRef(
  raw?: string | null
): { valid: true; fieldRef: string } | { valid: false; error: 'ADO_INVALID_INPUT' } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { valid: true, fieldRef: DEFAULT_ADO_COMPLETED_WORK_FIELD };
  }
  if (trimmed.length > 128 || !ADO_FIELD_REF_REGEX.test(trimmed)) {
    return { valid: false, error: 'ADO_INVALID_INPUT' };
  }
  return { valid: true, fieldRef: trimmed };
}

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

export function getAdoWorkItemTypeVisual(workItemType?: string | null): AdoWorkItemTypeVisual {
  const fullName = (workItemType ?? '').trim() || 'Work Item';
  const normalized = fullName.toLowerCase();

  if (normalized === 'bug') {
    return { kind: 'bug', shortLabel: 'BUG', fullName };
  }
  if (normalized === 'product backlog item') {
    return { kind: 'pbi', shortLabel: 'PBI', fullName };
  }
  if (normalized === 'user story') {
    return { kind: 'user_story', shortLabel: 'US', fullName };
  }
  if (normalized === 'task') {
    return { kind: 'task', shortLabel: 'TASK', fullName };
  }
  if (normalized === 'feature') {
    return { kind: 'feature', shortLabel: 'FEAT', fullName };
  }
  if (normalized === 'epic') {
    return { kind: 'epic', shortLabel: 'EPIC', fullName };
  }
  if (normalized === 'issue' || normalized === 'impediment') {
    return { kind: 'issue', shortLabel: normalized === 'issue' ? 'ISSUE' : 'IMP', fullName };
  }
  if (normalized === 'test case') {
    return { kind: 'test_case', shortLabel: 'TEST', fullName };
  }

  return {
    kind: 'other',
    shortLabel: fullName.slice(0, 8).toUpperCase(),
    fullName,
  };
}

/**
 * Converts an Azure DevOps Classification Node path (e.g. `\\Klox\\Iteration\\Sprint 4`)
 * into the WIQL-ready `System.IterationPath` (`Klox\\Sprint 4`).
 */
export function classificationNodePathToIterationPath(rawPath: string): string {
  const clean = rawPath.replace(/^\\+|\\+$/g, '').trim();
  if (!clean) return '';
  const segments = clean.split('\\').filter(Boolean);
  if (segments.length >= 2 && segments[1]!.toLowerCase() === 'iteration') {
    segments.splice(1, 1);
  }
  return segments.join('\\');
}

export function classifyIterationTimeFrame(
  startDate?: string,
  finishDate?: string,
  todayDateKey?: string
): AdoIterationTimeFrame {
  const today = todayDateKey && /^\d{4}-\d{2}-\d{2}$/.test(todayDateKey)
    ? todayDateKey
    : new Date().toISOString().slice(0, 10);
  const startKey = startDate ? startDate.slice(0, 10) : '';
  const finishKey = finishDate ? finishDate.slice(0, 10) : '';
  const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(startKey);
  const hasFinish = /^\d{4}-\d{2}-\d{2}$/.test(finishKey);

  if (hasStart && hasFinish) {
    if (startKey <= today && today <= finishKey) return 'current';
    if (finishKey < today) return 'past';
    return 'future';
  }
  if (hasStart) {
    return startKey > today ? 'future' : 'current';
  }
  if (hasFinish) {
    return finishKey < today ? 'past' : 'current';
  }
  return 'unscheduled';
}

export function pickDefaultCurrentIteration(
  iterations: readonly AdoIterationInfo[]
): AdoIterationInfo | null {
  if (iterations.length === 0) return null;
  const currents = iterations.filter((it) => it.timeFrame === 'current');
  if (currents.length > 0) return currents[currents.length - 1] ?? null;
  const firstFuture = iterations.find((it) => it.timeFrame === 'future');
  if (firstFuture) return firstFuture;
  const past = iterations.filter((it) => it.timeFrame === 'past');
  if (past.length > 0) return past[past.length - 1] ?? null;
  return iterations[iterations.length - 1] ?? null;
}

/**
 * Normalizes both multi-connection `adoConnections[]` and legacy single `adoConnection`
 * payloads into a canonical connected `AdoConnectionSummary[]` list.
 */
export function normalizeStoredAdoConnections(
  raw: { adoConnections?: unknown; adoConnection?: unknown } | null | undefined
): AdoConnectionSummary[] {
  if (!raw) return [];

  if (Array.isArray(raw.adoConnections)) {
    const normalized = raw.adoConnections
      .filter((item): item is Partial<AdoConnectionSummary> => Boolean(item && typeof item === 'object'))
      .filter((item) => Boolean(item.connected && item.orgUrl && item.defaultProject))
      .map((item, idx) => {
        const fieldCheck = normalizeAdoFieldRef(item.completedWorkFieldRef);
        const completedWorkFieldRef = fieldCheck.valid
          ? fieldCheck.fieldRef
          : DEFAULT_ADO_COMPLETED_WORK_FIELD;
        return {
          id: String(item.id || `ado_${idx}`),
          kloxProjectId: String(item.kloxProjectId || ''),
          connected: Boolean(item.connected),
          authType: item.authType === 'entra_oauth' ? 'entra_oauth' : 'pat',
          orgUrl: String(item.orgUrl || ''),
          organization: String(item.organization || ''),
          defaultProject: String(item.defaultProject || ''),
          defaultWorkItemType: String(item.defaultWorkItemType || 'Task'),
          ...(completedWorkFieldRef !== DEFAULT_ADO_COMPLETED_WORK_FIELD
            ? { completedWorkFieldRef }
            : {}),
          tokenHint: String(item.tokenHint || '••••'),
          connectedAt: String(item.connectedAt || ''),
          lastVerifiedAt: String(item.lastVerifiedAt || ''),
        };
      }) satisfies AdoConnectionSummary[];
    if (normalized.length > 0) return normalized;
  }

  const legacy = raw.adoConnection as Partial<AdoConnectionSummary> | null | undefined;
  if (legacy && typeof legacy === 'object' && legacy.connected && legacy.orgUrl) {
    const fieldCheck = normalizeAdoFieldRef(legacy.completedWorkFieldRef);
    const completedWorkFieldRef = fieldCheck.valid
      ? fieldCheck.fieldRef
      : DEFAULT_ADO_COMPLETED_WORK_FIELD;
    return [
      {
        id: String(legacy.id || LEGACY_ADO_CONNECTION_ID),
        kloxProjectId: String(legacy.kloxProjectId || ''),
        connected: true,
        authType: legacy.authType === 'entra_oauth' ? 'entra_oauth' : 'pat',
        orgUrl: String(legacy.orgUrl),
        organization: String(legacy.organization || ''),
        defaultProject: String(legacy.defaultProject || ''),
        defaultWorkItemType: String(legacy.defaultWorkItemType || 'Task'),
        ...(completedWorkFieldRef !== DEFAULT_ADO_COMPLETED_WORK_FIELD
          ? { completedWorkFieldRef }
          : {}),
        tokenHint: String(legacy.tokenHint || '••••'),
        connectedAt: String(legacy.connectedAt || ''),
        lastVerifiedAt: String(legacy.lastVerifiedAt || ''),
      },
    ];
  }

  return [];
}

/**
 * Resolves the effective Azure DevOps target for a Klox Project from its explicitly
 * bound ADO connection (`conn.kloxProjectId === project.id`), with safe fallback for
 * an unmigrated legacy single connection (`kloxProjectId === ''`).
 */
export function resolveEffectiveProjectAdoTarget(
  project: Project | undefined,
  connectionsOrSingle: readonly AdoConnectionSummary[] | AdoConnectionSummary | null | undefined
): EffectiveProjectAdoTarget | null {
  if (!project || project.systemKey === 'unassigned' || project.id === UNASSIGNED_PROJECT_ID) {
    return null;
  }

  const list = Array.isArray(connectionsOrSingle)
    ? connectionsOrSingle
    : connectionsOrSingle
      ? [connectionsOrSingle]
      : [];

  const connectedList = list.filter((c) => Boolean(c?.connected));
  if (connectedList.length === 0) return null;

  const bound =
    connectedList.find((c) => c.kloxProjectId === project.id) ??
    (connectedList.length === 1 && !connectedList[0]!.kloxProjectId ? connectedList[0] : undefined);

  if (!bound) return null;

  const cfg = project.adoConfig ?? null;
  const enabled = cfg ? cfg.enabled : true;

  const rawOrg = cfg?.orgUrl?.trim() || bound.orgUrl;
  const norm = normalizeAdoOrgUrl(rawOrg);
  const orgUrl = norm.valid ? norm.orgUrl : bound.orgUrl;
  const organization = norm.valid ? norm.organization : bound.organization;
  const targetProject = cfg?.project?.trim() || bound.defaultProject;
  const defaultWorkItemType = cfg?.defaultWorkItemType?.trim() || bound.defaultWorkItemType || 'Task';
  const fieldCheck = normalizeAdoFieldRef(bound.completedWorkFieldRef);
  const completedWorkFieldRef = fieldCheck.valid
    ? fieldCheck.fieldRef
    : DEFAULT_ADO_COMPLETED_WORK_FIELD;

  if (!targetProject) return null;

  return {
    connectionId: bound.id,
    enabled,
    orgUrl,
    organization,
    project: targetProject,
    defaultWorkItemType,
    completedWorkFieldRef,
  };
}

/**
 * Resolves whether an ADO-linked Task's work item type supports the configured hours field.
 * Always returns `true` for unlinked local tasks.
 */
export function resolveTaskSupportsCompletedWork(
  task: Task,
  workItemTypes?: readonly AdoWorkItemTypeCapability[],
  completedWorkFieldRef?: string
): boolean {
  if (
    task.externalProvider !== 'azure_devops' ||
    parseWorkItemIdInput(task.externalWorkItemId) === null
  ) {
    return true;
  }

  if (task.externalWorkItemType && workItemTypes && workItemTypes.length > 0) {
    const typeLower = task.externalWorkItemType.trim().toLowerCase();
    const liveMatch = workItemTypes.find((wt) => wt.name.toLowerCase() === typeLower);
    if (liveMatch) return liveMatch.supportsCompletedWork;
  }

  if (typeof task.externalSupportsCompletedWork === 'boolean') {
    return task.externalSupportsCompletedWork;
  }

  const fieldCheck = normalizeAdoFieldRef(completedWorkFieldRef);
  const activeField = fieldCheck.valid ? fieldCheck.fieldRef : DEFAULT_ADO_COMPLETED_WORK_FIELD;
  if (activeField.toLowerCase() === DEFAULT_ADO_COMPLETED_WORK_FIELD.toLowerCase()) {
    const wt = (task.externalWorkItemType ?? '').trim().toLowerCase();
    if (wt && NON_COMPLETED_WORK_CONTAINER_TYPES.has(wt)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates whether a live Timer can be started against `task` under current `TaskTrackingPolicy`.
 */
export function evaluateTaskTimerEligibility(params: {
  task: Task;
  allTasks: readonly Task[];
  policy?: Partial<TaskTrackingPolicy> | null;
  workItemTypes?: readonly AdoWorkItemTypeCapability[];
  completedWorkFieldRef?: string;
}): TaskTimerEligibility {
  const policy = normalizeTaskTrackingPolicy(params.policy);
  const hasChildren = params.allTasks.some(
    (t) => t.projectId === params.task.projectId && t.parentTaskId === params.task.id
  );

  if (hasChildren) {
    if (!policy.allowParentTaskTracking) {
      return { allowed: false, reason: 'PARENT_HAS_SUBTASKS' };
    }
    // When parent tracking is explicitly allowed, direct parent hours route to child Task creation on ADO sync.
    return { allowed: true, reason: null };
  }

  const isAdoLinked =
    params.task.externalProvider === 'azure_devops' &&
    parseWorkItemIdInput(params.task.externalWorkItemId) !== null;

  if (
    isAdoLinked &&
    !resolveTaskSupportsCompletedWork(
      params.task,
      params.workItemTypes,
      params.completedWorkFieldRef
    ) &&
    !policy.allowNonCompletedWorkTracking
  ) {
    return { allowed: false, reason: 'ADO_COMPLETED_WORK_UNSUPPORTED' };
  }

  return { allowed: true, reason: null };
}

function hasAnyAdoDescendant(children: readonly TaskTreeNode[]): boolean {
  for (const child of children) {
    if (
      child.task.externalProvider === 'azure_devops' &&
      parseWorkItemIdInput(child.task.externalWorkItemId) !== null
    ) {
      return true;
    }
    if (hasAnyAdoDescendant(child.children)) return true;
  }
  return false;
}

/**
 * Computes effective `CompletedWork` hours for a task node:
 * parent containers sum their children's hours, while Level-1 ADO Tasks whose only children
 * are manual local Level-2 sub-subtasks retain their authoritative ADO `CompletedWork` hours.
 */
export function computeEffectiveTaskCompletedWorkHours(
  node: TaskTreeNode,
  workItemTypes?: readonly AdoWorkItemTypeCapability[],
  completedWorkFieldRef?: string
): number {
  if (node.children.length === 0) {
    return roundHours2(node.task.completedWorkHours || 0);
  }

  let childrenSum = 0;
  for (const child of node.children) {
    childrenSum += computeEffectiveTaskCompletedWorkHours(
      child,
      workItemTypes,
      completedWorkFieldRef
    );
  }
  const roundedChildrenSum = roundHours2(childrenSum);

  const isSelfAdoHoursTarget =
    node.task.externalProvider === 'azure_devops' &&
    parseWorkItemIdInput(node.task.externalWorkItemId) !== null &&
    resolveTaskSupportsCompletedWork(node.task, workItemTypes, completedWorkFieldRef);

  if (isSelfAdoHoursTarget && !hasAnyAdoDescendant(node.children)) {
    return roundHours2(node.task.completedWorkHours || 0);
  }

  return roundedChildrenSum;
}

export function buildEffectiveCompletedWorkMap(
  roots: readonly TaskTreeNode[],
  workItemTypes?: readonly AdoWorkItemTypeCapability[],
  completedWorkFieldRef?: string
): Map<EntityId, number> {
  const map = new Map<EntityId, number>();
  const walk = (node: TaskTreeNode): number => {
    let val: number;
    if (node.children.length === 0) {
      val = roundHours2(node.task.completedWorkHours || 0);
    } else {
      let childrenSum = 0;
      for (const child of node.children) {
        childrenSum += walk(child);
      }
      const roundedChildrenSum = roundHours2(childrenSum);
      const isSelfAdoHoursTarget =
        node.task.externalProvider === 'azure_devops' &&
        parseWorkItemIdInput(node.task.externalWorkItemId) !== null &&
        resolveTaskSupportsCompletedWork(node.task, workItemTypes, completedWorkFieldRef);
      val =
        isSelfAdoHoursTarget && !hasAnyAdoDescendant(node.children)
          ? roundHours2(node.task.completedWorkHours || 0)
          : roundedChildrenSum;
    }
    map.set(node.task.id, val);
    return val;
  };
  for (const root of roots) {
    walk(root);
  }
  return map;
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
  connections?: readonly AdoConnectionSummary[];
  connection?: AdoConnectionSummary | null;
  filterProjectId?: EntityId;
  allowParentTaskTracking?: boolean;
  workItemTypesByConn?:
    | ReadonlyMap<EntityId, readonly AdoWorkItemTypeCapability[]>
    | Partial<Record<EntityId, readonly AdoWorkItemTypeCapability[]>>;
}): AdoSyncCandidatesResult {
  const {
    projects,
    tasks,
    logs,
    connections,
    connection,
    filterProjectId,
    allowParentTaskTracking = false,
    workItemTypesByConn,
  } = params;
  const activeConnections = connections ?? (connection ? [connection] : []);
  if (!activeConnections.some((c) => c?.connected)) {
    return {
      readyItems: [],
      unplannedTasks: [],
      suggestedChildTasks: [],
      totalUnsyncedSeconds: 0,
      totalRecommendedHours: 0,
      totalSuggestedChildHours: 0,
    };
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const parentIdsWithSubtasks = new Set<EntityId>();
  const parentIdsWithAdoChildren = new Set<EntityId>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const parent = taskById.get(t.parentTaskId);
    if (!parent || parent.projectId !== t.projectId) continue;
    parentIdsWithSubtasks.add(parent.id);
    if (
      t.externalProvider === 'azure_devops' &&
      parseWorkItemIdInput(t.externalWorkItemId) !== null
    ) {
      parentIdsWithAdoChildren.add(parent.id);
    }
  }

  const readyByKey = new Map<string, AdoSyncCandidate>();
  const unplannedByTaskId = new Map<EntityId, UnplannedAdoTaskCandidate>();
  const suggestedChildByKey = new Map<string, SuggestedChildAdoTaskCandidate>();

  for (const log of logs) {
    if (!log.taskId || log.durationSeconds <= 0) continue;
    if (filterProjectId && log.projectId !== filterProjectId) continue;

    const leafTask = taskById.get(log.taskId);
    if (!leafTask) continue;

    const project = projectById.get(leafTask.projectId);
    const target = resolveEffectiveProjectAdoTarget(project, activeConnections);
    if (!target || !target.enabled) continue;

    const controllingTask = resolveControllingAdoTask(leafTask.id, tasks);

    if (controllingTask) {
      const workItemId = parseWorkItemIdInput(controllingTask.externalWorkItemId);
      if (!workItemId) continue;

      const connTypes: readonly AdoWorkItemTypeCapability[] | undefined =
        workItemTypesByConn instanceof Map
          ? workItemTypesByConn.get(target.connectionId)
          : (
              workItemTypesByConn as
                | Partial<Record<EntityId, readonly AdoWorkItemTypeCapability[]>>
                | undefined
            )?.[target.connectionId];

      const supportsCompletedWork = resolveTaskSupportsCompletedWork(
        controllingTask,
        connTypes,
        target.completedWorkFieldRef
      );

      const isDirectParentTracked =
        allowParentTaskTracking &&
        leafTask.id === controllingTask.id &&
        parentIdsWithSubtasks.has(controllingTask.id) &&
        (parentIdsWithAdoChildren.has(controllingTask.id) || !supportsCompletedWork);

      const orgUrl = controllingTask.externalOrgUrl?.trim() || target.orgUrl;
      const adoProject = controllingTask.externalProject?.trim() || target.project;
      const unsynced = computeLogUnsyncedSeconds(log, {
        workItemId,
        orgUrl,
        project: adoProject,
      });
      if (unsynced <= 0) continue;

      if (isDirectParentTracked) {
        const sKey = `child-suggestion::${controllingTask.id}::${workItemId}`;
        let sBucket = suggestedChildByKey.get(sKey);
        if (!sBucket) {
          const preferredTaskType =
            connTypes?.find((wt) => wt.name.toLowerCase() === 'task' && wt.supportsCompletedWork)
              ?.name ??
            connTypes?.find((wt) => wt.supportsCompletedWork)?.name ??
            target.defaultWorkItemType ??
            'Task';

          sBucket = {
            key: sKey,
            connectionId: target.connectionId,
            parentTask: controllingTask,
            parentWorkItemId: workItemId,
            parentWorkItemType: controllingTask.externalWorkItemType,
            parentWorkItemTitle: controllingTask.externalWorkItemTitle ?? controllingTask.name,
            parentWorkItemUrl:
              controllingTask.externalWorkItemUrl ||
              buildAdoWorkItemWebUrl(orgUrl, adoProject, workItemId),
            orgUrl,
            project: adoProject,
            defaultWorkItemType: preferredTaskType,
            projectName: project?.name ?? log.projectNameSnapshot,
            projectColor: project?.color ?? log.projectColorSnapshot,
            suggestedTitle: controllingTask.name,
            logs: [],
            unsyncedSeconds: 0,
            recommendedHours: 0,
          };
          suggestedChildByKey.set(sKey, sBucket);
        }
        sBucket.logs.push(log);
        sBucket.unsyncedSeconds += unsynced;
        continue;
      }

      if (!supportsCompletedWork) {
        // Non-CompletedWork items (e.g. PBI, User Story) can never be pushed directly to Azure DevOps
        continue;
      }

      const key = `${orgUrl.toLowerCase()}::${adoProject.toLowerCase()}::${workItemId}`;
      let bucket = readyByKey.get(key);
      if (!bucket) {
        bucket = {
          key,
          connectionId: target.connectionId,
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

      bucket.logs.push({
        log,
        unsyncedSeconds: unsynced,
        sourceTaskId: leafTask.id,
        sourceTaskLabel: formatTaskHierarchyLabel(leafTask, tasks),
        isRolledUpFromDescendant: leafTask.id !== controllingTask.id,
      });
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

  const suggestedChildTasks = Array.from(suggestedChildByKey.values())
    .map((bucket) => {
      const parentTitleLower = bucket.parentTask.name.trim().toLowerCase();
      const sortedLogs = [...bucket.logs].sort((a, b) => b.startTime.localeCompare(a.startTime));
      const descriptive = sortedLogs.find((l) => {
        const desc = l.description.trim();
        return desc.length > 0 && desc.toLowerCase() !== parentTitleLower;
      });
      return {
        ...bucket,
        logs: sortedLogs,
        suggestedTitle: descriptive?.description.trim() || bucket.parentTask.name,
        recommendedHours: secondsToHours2(bucket.unsyncedSeconds),
      };
    })
    .filter((bucket) => bucket.unsyncedSeconds > 0)
    .sort((a, b) => b.unsyncedSeconds - a.unsyncedSeconds || a.parentWorkItemId - b.parentWorkItemId);

  const totalUnsyncedSeconds = readyItems.reduce((sum, item) => sum + item.unsyncedSeconds, 0);
  const totalSuggestedChildSeconds = suggestedChildTasks.reduce(
    (sum, item) => sum + item.unsyncedSeconds,
    0
  );

  return {
    readyItems,
    unplannedTasks,
    suggestedChildTasks,
    totalUnsyncedSeconds,
    totalRecommendedHours: secondsToHours2(totalUnsyncedSeconds),
    totalSuggestedChildHours: secondsToHours2(totalSuggestedChildSeconds),
  };
}

export interface AdoSyncParentGroup {
  key: string;
  isParentContainer: boolean;
  parentTask: Task | null;
  projectName: string;
  projectColor: string;
  items: AdoSyncCandidate[];
  suggestedChildren: SuggestedChildAdoTaskCandidate[];
  totalCachedCompletedWork: number;
  totalUnsyncedSeconds: number;
  totalRecommendedDeltaHours: number;
}

/**
 * Organizes flat pushable `AdoSyncCandidate` items and suggested new child ADO Tasks into a
 * 2-level hierarchy keyed by each item's root ancestor `Task` (e.g., PBI -> child Tasks),
 * keeping standalone root items ungrouped.
 */
export function groupAdoSyncCandidatesByParent(
  readyItems: readonly AdoSyncCandidate[],
  allTasks: readonly Task[],
  suggestedChildTasks: readonly SuggestedChildAdoTaskCandidate[] = []
): AdoSyncParentGroup[] {
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const groups = new Map<string, AdoSyncParentGroup>();

  const findRootAncestor = (task: Task): Task | null => {
    let current = task;
    const seen = new Set<EntityId>([task.id]);
    while (current.parentTaskId && !seen.has(current.parentTaskId)) {
      seen.add(current.parentTaskId);
      const parent = taskById.get(current.parentTaskId);
      if (!parent || parent.projectId !== task.projectId) break;
      current = parent;
    }
    return current.id !== task.id ? current : null;
  };

  for (const item of readyItems) {
    const rootAncestor = findRootAncestor(item.primaryTask);
    const key = rootAncestor ? `parent:${rootAncestor.id}` : item.key;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        isParentContainer: Boolean(rootAncestor),
        parentTask: rootAncestor,
        projectName: item.projectName,
        projectColor: item.projectColor,
        items: [],
        suggestedChildren: [],
        totalCachedCompletedWork: 0,
        totalUnsyncedSeconds: 0,
        totalRecommendedDeltaHours: 0,
      };
      groups.set(key, group);
    }
    group.items.push(item);
    group.totalCachedCompletedWork = roundHours2(
      group.totalCachedCompletedWork + (item.cachedCompletedWork || 0)
    );
    group.totalUnsyncedSeconds += item.unsyncedSeconds;
  }

  for (const suggested of suggestedChildTasks) {
    const rootAncestor = findRootAncestor(suggested.parentTask) ?? suggested.parentTask;
    const key = `parent:${rootAncestor.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        isParentContainer: true,
        parentTask: rootAncestor,
        projectName: suggested.projectName,
        projectColor: suggested.projectColor,
        items: [],
        suggestedChildren: [],
        totalCachedCompletedWork: 0,
        totalUnsyncedSeconds: 0,
        totalRecommendedDeltaHours: 0,
      };
      groups.set(key, group);
    }
    group.suggestedChildren.push(suggested);
    group.totalUnsyncedSeconds += suggested.unsyncedSeconds;
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) =>
          compareTasksByPriority(a.primaryTask, b.primaryTask) || a.workItemId - b.workItemId
      ),
      suggestedChildren: [...group.suggestedChildren].sort(
        (a, b) => b.unsyncedSeconds - a.unsyncedSeconds
      ),
      totalRecommendedDeltaHours: secondsToHours2(group.totalUnsyncedSeconds),
    }))
    .sort((a, b) => b.totalUnsyncedSeconds - a.totalUnsyncedSeconds);
}
