import type { EntityId, Project, ProjectTag, Task, TaskDepth } from './types';

export const UNASSIGNED_PROJECT_ID: EntityId = 'system_unassigned';

export const MAX_TASK_DEPTH: TaskDepth = 2; // 0 = Task, 1 = Subtask, 2 = Sub-subtask
export const MAX_TASK_TAGS = 25;
export const MAX_TAG_NAME_LENGTH = 80;
export const TASK_SORT_ORDER_STEP = 1024;

export const PROJECT_COLOR_PALETTE: readonly string[] = [
  '#3B82F6', // Electric Cobalt (Default Telemetry Accent)
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Crimson
  '#8B5CF6', // Violet
  '#EC4899', // Rose
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

/**
 * Domain Invariant (GEMINI.md §2.2):
 * ONLY the tags owned by the selected Project may be shown or selected.
 */
export function tagsForProject(
  allTags: readonly ProjectTag[],
  projectId: EntityId | null | undefined
): ProjectTag[] {
  if (!projectId) return [];
  return allTags.filter((tag) => tag.projectId === projectId);
}

export function buildTagNameMap(
  tags: readonly Pick<ProjectTag, 'id' | 'name'>[]
): Map<EntityId, string> {
  return new Map(tags.map((tag) => [tag.id, tag.name]));
}

/**
 * Resolves `TimeLog.tagIds` against the live ProjectTag catalog at render/export time.
 * Missing or deleted tag IDs are omitted cleanly rather than rendering stale snapshots.
 */
export function resolveTagNames(
  tagIds: readonly EntityId[],
  tagsOrMap: readonly Pick<ProjectTag, 'id' | 'name'>[] | ReadonlyMap<EntityId, string>
): string[] {
  const byId = tagsOrMap instanceof Map ? tagsOrMap : buildTagNameMap(tagsOrMap as readonly Pick<ProjectTag, 'id' | 'name'>[]);
  const resolved: string[] = [];
  for (const tagId of tagIds) {
    const name = byId.get(tagId);
    if (name !== undefined) {
      resolved.push(name);
    }
  }
  return resolved;
}

export type TagRenameErrorCode =
  | 'TAG_NAME_EMPTY'
  | 'TAG_NAME_TOO_LONG'
  | 'TAG_NOT_FOUND'
  | 'TAG_DUPLICATE_NAME';

/**
 * Validates renaming an existing `ProjectTag` within its parent Project's vocabulary.
 */
export function validateProjectTagRename(params: {
  tagId: EntityId;
  nextName: string;
  allTags: readonly ProjectTag[];
}): {
  valid: boolean;
  normalizedName: string;
  error?: TagRenameErrorCode;
} {
  const normalizedName = params.nextName.trim();
  if (!normalizedName) {
    return { valid: false, normalizedName, error: 'TAG_NAME_EMPTY' };
  }
  if (normalizedName.length > MAX_TAG_NAME_LENGTH) {
    return { valid: false, normalizedName, error: 'TAG_NAME_TOO_LONG' };
  }

  const target = params.allTags.find((t) => t.id === params.tagId);
  if (!target) {
    return { valid: false, normalizedName, error: 'TAG_NOT_FOUND' };
  }

  const lower = normalizedName.toLowerCase();
  const hasDuplicate = params.allTags.some(
    (t) =>
      t.id !== target.id &&
      t.projectId === target.projectId &&
      t.name.trim().toLowerCase() === lower
  );
  if (hasDuplicate) {
    return { valid: false, normalizedName, error: 'TAG_DUPLICATE_NAME' };
  }

  return { valid: true, normalizedName };
}

/**
 * Domain Invariant (FR-6.1):
 * An active timer is considered empty (and discarded cleanly on cancel/stop)
 * when description is blank, project is unassigned, no task is linked, and no tags are selected.
 */
export function isEmptyActiveTimer(state: {
  description: string;
  projectId: EntityId | null | undefined;
  taskId?: EntityId | null;
  tagIds?: readonly EntityId[];
}): boolean {
  return (
    state.description.trim() === '' &&
    (!state.projectId || state.projectId === UNASSIGNED_PROJECT_ID) &&
    !state.taskId &&
    (state.tagIds?.length ?? 0) === 0
  );
}

/**
 * Domain Invariant (GEMINI.md §2.2):
 * Switching projects clears any selected tags that do not belong to the new project
 * and defaults `isBillable` to the new Project's `isBillableDefault`.
 */
export function applyProjectSwitch(params: {
  nextProject: Project;
  currentTagIds: readonly EntityId[];
  allTags: readonly ProjectTag[];
}): {
  projectId: EntityId;
  tagIds: EntityId[];
  isBillable: boolean;
} {
  const allowedIds = new Set(
    tagsForProject(params.allTags, params.nextProject.id).map((t) => t.id)
  );
  const filteredTagIds = params.currentTagIds.filter((id) => allowedIds.has(id));
  return {
    projectId: params.nextProject.id,
    tagIds: filteredTagIds,
    isBillable: params.nextProject.isBillableDefault,
  };
}

/**
 * Creates the deterministic fallback "General / Unassigned" system project for a user.
 * Its display name is rendered via i18n (`catalog.unassigned`) whenever `systemKey === 'unassigned'`.
 */
export function createUnassignedProject(userId: string, nowIso = new Date().toISOString()): Project {
  return {
    id: UNASSIGNED_PROJECT_ID,
    userId,
    name: 'General / Unassigned',
    color: '#8E8E93',
    isBillableDefault: false,
    systemKey: 'unassigned',
    createdAt: nowIso,
  };
}

/**
 * Validates that an optional `parentTaskId` belongs to the same `projectId`
 * and does not exceed `MAX_TASK_DEPTH` (0 = Task -> 1 = Subtask -> 2 = Sub-subtask).
 */
export function validateTaskParent(params: {
  projectId: EntityId;
  parentTaskId?: EntityId | null;
  allTasks: readonly Task[];
  selfTaskId?: EntityId;
}): { valid: boolean; depth: TaskDepth; error?: string } {
  if (!params.parentTaskId) {
    return { valid: true, depth: 0 };
  }

  if (params.selfTaskId && params.parentTaskId === params.selfTaskId) {
    return { valid: false, depth: 0, error: 'TASK_SELF_PARENT' };
  }

  const parent = params.allTasks.find((t) => t.id === params.parentTaskId);
  if (!parent) {
    return { valid: false, depth: 0, error: 'TASK_PARENT_NOT_FOUND' };
  }

  if (parent.projectId !== params.projectId) {
    return { valid: false, depth: 0, error: 'TASK_CROSS_PROJECT_PARENT' };
  }

  const parentDepth = (parent.depth ?? 0) as TaskDepth;
  if (parentDepth >= MAX_TASK_DEPTH) {
    return { valid: false, depth: MAX_TASK_DEPTH, error: 'TASK_MAX_DEPTH_EXCEEDED' };
  }

  return {
    valid: true,
    depth: (parentDepth + 1) as TaskDepth,
  };
}

export interface TaskTreeNode {
  task: Task;
  depth: TaskDepth;
  hierarchicalLabel: string;
  children: TaskTreeNode[];
}

/**
 * Computes the full hierarchical path label for a Task (e.g. "Auth Module / OAuth Flow / Write unit tests").
 */
export function formatTaskHierarchyLabel(task: Task, allTasks: readonly Task[]): string {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const parts: string[] = [task.name];
  let current: Task | undefined = task;
  const visited = new Set<EntityId>([task.id]);

  while (current?.parentTaskId && !visited.has(current.parentTaskId)) {
    visited.add(current.parentTaskId);
    const parent = byId.get(current.parentTaskId);
    if (!parent || parent.projectId !== task.projectId) break;
    parts.unshift(parent.name);
    current = parent;
  }

  return parts.join(' / ');
}

/**
 * Priority comparator for sibling tasks sharing `(projectId, parentTaskId)`.
 */
export function compareTasksByPriority(a: Task, b: Task): number {
  const orderA =
    typeof a.sortOrder === 'number' && Number.isFinite(a.sortOrder)
      ? a.sortOrder
      : Number.MAX_SAFE_INTEGER;
  const orderB =
    typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder)
      ? b.sortOrder
      : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
}

/**
 * Computes the next sparse sortOrder for appending a newly created task to its sibling list.
 */
export function nextTaskSortOrder(siblings: readonly Pick<Task, 'sortOrder'>[]): number {
  let maxOrder = 0;
  for (const s of siblings) {
    if (typeof s.sortOrder === 'number' && Number.isFinite(s.sortOrder) && s.sortOrder > maxOrder) {
      maxOrder = s.sortOrder;
    }
  }
  return maxOrder + TASK_SORT_ORDER_STEP;
}

/**
 * Reorders `movedTaskId` among its same-parent siblings using sparse midpoint stack ranking.
 * Falls back to full sibling normalization when uninitialized or when float gap narrows below 0.002.
 */
export function computeTaskSiblingReorder(params: {
  siblings: readonly Task[];
  movedTaskId: EntityId;
  targetIndex: number;
}): Array<{ taskId: EntityId; sortOrder: number }> {
  const ordered = [...params.siblings].sort(compareTasksByPriority);
  const fromIdx = ordered.findIndex((t) => t.id === params.movedTaskId);
  if (fromIdx === -1 || ordered.length <= 1) return [];

  const clampedTarget = Math.max(0, Math.min(params.targetIndex, ordered.length - 1));
  if (clampedTarget === fromIdx) return [];

  const [moved] = ordered.splice(fromIdx, 1);
  if (!moved) return [];
  ordered.splice(clampedTarget, 0, moved);

  const allInitialized = ordered.every(
    (t) => typeof t.sortOrder === 'number' && Number.isFinite(t.sortOrder)
  );

  if (allInitialized) {
    const prev = clampedTarget > 0 ? ordered[clampedTarget - 1]?.sortOrder : undefined;
    const next =
      clampedTarget < ordered.length - 1 ? ordered[clampedTarget + 1]?.sortOrder : undefined;

    let candidate: number | null = null;
    if (prev !== undefined && next !== undefined) {
      if (next - prev >= 0.002) {
        candidate = (prev + next) / 2;
      }
    } else if (prev !== undefined) {
      candidate = prev + TASK_SORT_ORDER_STEP;
    } else if (next !== undefined) {
      candidate = next - TASK_SORT_ORDER_STEP;
    }

    if (candidate !== null && Number.isFinite(candidate)) {
      if (moved.sortOrder === candidate) return [];
      return [{ taskId: moved.id, sortOrder: candidate }];
    }
  }

  const updates: Array<{ taskId: EntityId; sortOrder: number }> = [];
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i]!;
    const nextOrder = (i + 1) * TASK_SORT_ORDER_STEP;
    if (t.sortOrder !== nextOrder) {
      updates.push({ taskId: t.id, sortOrder: nextOrder });
    }
  }
  return updates;
}

export interface TaskReparentUpdate {
  taskId: EntityId;
  parentTaskId: EntityId | null;
  depth: TaskDepth;
  sortOrder?: number;
}

/**
 * Re-parents `taskId` under `newParentTaskId` (or promotes it to root `null`) for
 * Google-Tasks style Tab (indent) / Shift+Tab (outdent), updating descendant depths safely
 * without exceeding `MAX_TASK_DEPTH` (2) or creating cycles.
 */
export function computeTaskReparent(params: {
  taskId: EntityId;
  newParentTaskId: EntityId | null;
  allTasks: readonly Task[];
}): {
  valid: boolean;
  updates: TaskReparentUpdate[];
  error?: string;
} {
  const byId = new Map(params.allTasks.map((t) => [t.id, t]));
  const target = byId.get(params.taskId);
  if (!target) {
    return { valid: false, updates: [], error: 'TASK_NOT_FOUND' };
  }

  const nextParentId = params.newParentTaskId || null;
  const currentParentId = target.parentTaskId ?? null;
  if (currentParentId === nextParentId) {
    return { valid: true, updates: [] };
  }

  const descendants = collectDescendantTaskIds(target.id, params.allTasks);
  if (nextParentId && descendants.includes(nextParentId)) {
    return { valid: false, updates: [], error: 'TASK_SELF_PARENT' };
  }

  const computeActualDepth = (task: Task): number => {
    let d = 0;
    let cur: Task | undefined = task;
    const seen = new Set<EntityId>([task.id]);
    while (cur?.parentTaskId && !seen.has(cur.parentTaskId)) {
      seen.add(cur.parentTaskId);
      const p = byId.get(cur.parentTaskId);
      if (!p || p.projectId !== task.projectId) break;
      d += 1;
      cur = p;
    }
    return d;
  };

  let newDepthNum = 0;
  if (nextParentId) {
    const parent = byId.get(nextParentId);
    if (!parent) {
      return { valid: false, updates: [], error: 'TASK_PARENT_NOT_FOUND' };
    }
    if (parent.projectId !== target.projectId) {
      return { valid: false, updates: [], error: 'TASK_CROSS_PROJECT_PARENT' };
    }
    newDepthNum = computeActualDepth(parent) + 1;
  }

  // BFS relative depth offsets across `target` and all descendants
  const relOffsets = new Map<EntityId, number>([[target.id, 0]]);
  const queue: EntityId[] = [target.id];
  let maxSubtreeOffset = 0;
  while (queue.length > 0) {
    const curId = queue.shift()!;
    const curOffset = relOffsets.get(curId) ?? 0;
    for (const child of params.allTasks) {
      if (child.parentTaskId === curId && !relOffsets.has(child.id)) {
        const nextOffset = curOffset + 1;
        relOffsets.set(child.id, nextOffset);
        if (nextOffset > maxSubtreeOffset) maxSubtreeOffset = nextOffset;
        queue.push(child.id);
      }
    }
  }

  if (newDepthNum + maxSubtreeOffset > MAX_TASK_DEPTH) {
    return { valid: false, updates: [], error: 'TASK_MAX_DEPTH_EXCEEDED' };
  }

  const newSiblings = params.allTasks.filter(
    (t) =>
      t.projectId === target.projectId &&
      (t.parentTaskId ?? null) === nextParentId &&
      t.id !== target.id
  );
  const nextSortOrder = nextTaskSortOrder(newSiblings);

  const updates: TaskReparentUpdate[] = [];
  for (const [id, offset] of relOffsets.entries()) {
    const item = byId.get(id);
    if (!item) continue;
    updates.push({
      taskId: id,
      parentTaskId: id === target.id ? nextParentId : (item.parentTaskId ?? null),
      depth: (newDepthNum + offset) as TaskDepth,
      ...(id === target.id ? { sortOrder: nextSortOrder } : {}),
    });
  }

  return { valid: true, updates };
}

/**
 * Builds a 3-level sorted tree of Tasks -> Subtasks -> Sub-subtasks for a Project.
 */
export function buildTaskTree(
  allTasks: readonly Task[],
  projectId: EntityId | null | undefined
): TaskTreeNode[] {
  if (!projectId) return [];
  const projectTasks = allTasks
    .filter((t) => t.projectId === projectId)
    .sort(compareTasksByPriority);

  const nodeById = new Map<EntityId, TaskTreeNode>();
  for (const t of projectTasks) {
    nodeById.set(t.id, {
      task: t,
      depth: (t.depth ?? 0) as TaskDepth,
      hierarchicalLabel: formatTaskHierarchyLabel(t, projectTasks),
      children: [],
    });
  }

  const roots: TaskTreeNode[] = [];
  for (const t of projectTasks) {
    const node = nodeById.get(t.id)!;
    if (t.parentTaskId && nodeById.has(t.parentTaskId)) {
      const parentNode = nodeById.get(t.parentTaskId)!;
      node.depth = Math.min(MAX_TASK_DEPTH, parentNode.depth + 1) as TaskDepth;
      parentNode.children.push(node);
    } else {
      node.depth = 0;
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TaskTreeNode[]) => {
    nodes.sort((a, b) => compareTasksByPriority(a.task, b.task));
    for (const n of nodes) {
      if (n.children.length > 0) sortChildren(n.children);
    }
  };
  sortChildren(roots);

  return roots;
}

/**
 * Flattens a `TaskTreeNode[]` in pre-order traversal so dropdowns and tree lists render cleanly.
 */
export function flattenTaskTree(roots: readonly TaskTreeNode[]): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  function walk(nodes: readonly TaskTreeNode[]) {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(roots);
  return out;
}

/**
 * Collects a task's ID plus all its descendant subtask and sub-subtask IDs (for cascade delete or hour roll-up).
 */
export function collectDescendantTaskIds(
  rootTaskId: EntityId,
  allTasks: readonly Task[]
): EntityId[] {
  const result = new Set<EntityId>([rootTaskId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of allTasks) {
      if (t.parentTaskId && result.has(t.parentTaskId) && !result.has(t.id)) {
        result.add(t.id);
        added = true;
      }
    }
  }
  return Array.from(result);
}

/**
 * Enforces Project-Scoped Tag ownership on a Task: drops invalid or cross-project IDs,
 * deduplicates while preserving order, and caps at MAX_TASK_TAGS (25).
 */
export function sanitizeTaskTagIds(
  tagIds: readonly EntityId[] | null | undefined,
  projectId: EntityId,
  allTags: readonly ProjectTag[]
): EntityId[] {
  if (!tagIds || tagIds.length === 0) return [];
  const allowed = new Set(tagsForProject(allTags, projectId).map((t) => t.id));
  const out: EntityId[] = [];
  const seen = new Set<EntityId>();
  for (const id of tagIds) {
    if (typeof id !== 'string') continue;
    const clean = id.trim();
    if (!clean || seen.has(clean) || !allowed.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_TASK_TAGS) break;
  }
  return out;
}

export type BulkTagUpdateMode = 'add' | 'remove' | 'replace';

/**
 * Computes the next sanitized project-scoped `tagIds` for a single task during a bulk tag operation.
 */
export function computeBulkTaskTagIds(params: {
  currentTagIds?: readonly EntityId[] | null;
  targetTagIds: readonly EntityId[];
  mode: BulkTagUpdateMode;
  projectId: EntityId;
  allTags: readonly ProjectTag[];
}): EntityId[] {
  const current = sanitizeTaskTagIds(params.currentTagIds, params.projectId, params.allTags);
  const target = sanitizeTaskTagIds(params.targetTagIds, params.projectId, params.allTags);

  if (params.mode === 'replace') {
    return target;
  }

  if (params.mode === 'add') {
    if (target.length === 0) return current;
    return sanitizeTaskTagIds([...current, ...target], params.projectId, params.allTags);
  }

  // 'remove'
  if (target.length === 0) return current;
  const removeSet = new Set(target);
  return current.filter((id) => !removeSet.has(id));
}

/**
 * Summarizes which tags are shared across ALL selected tasks vs SOME selected tasks.
 */
export function summarizeSelectedTaskTags(tasks: readonly Task[]): {
  commonTagIds: EntityId[];
  partialTagIds: EntityId[];
} {
  if (tasks.length === 0) {
    return { commonTagIds: [], partialTagIds: [] };
  }

  const counts = new Map<EntityId, number>();
  const orderedIds: EntityId[] = [];
  for (const task of tasks) {
    const uniqueForTask = new Set(task.tagIds ?? []);
    for (const id of uniqueForTask) {
      if (!counts.has(id)) orderedIds.push(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const commonTagIds: EntityId[] = [];
  const partialTagIds: EntityId[] = [];
  for (const id of orderedIds) {
    if ((counts.get(id) ?? 0) === tasks.length) {
      commonTagIds.push(id);
    } else {
      partialTagIds.push(id);
    }
  }
  return { commonTagIds, partialTagIds };
}

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates canonical "YYYY-MM-DD" deadline strings stored on Tasks.
 */
export function isValidTaskDueDate(dateKey: string | null | undefined): dateKey is string {
  if (typeof dateKey !== 'string') return false;
  return ISO_DATE_KEY_RE.test(dateKey.trim());
}

export type DueDateTone = 'overdue' | 'today' | 'upcoming' | 'done';

/**
 * Classifies visual urgency tone for a Task deadline relative to user's timezone `todayDateKey`.
 */
export function classifyDueDateTone(
  dueDate: string,
  todayDateKey: string,
  status: Task['status']
): DueDateTone {
  if (status === 'done') return 'done';
  if (dueDate < todayDateKey) return 'overdue';
  if (dueDate === todayDateKey) return 'today';
  return 'upcoming';
}

/**
 * Collects deduplicated task IDs + descendants across multiple selected tasks for batch delete.
 */
export function collectBulkDeleteTaskIds(
  selectedIds: Iterable<EntityId>,
  allTasks: readonly Task[]
): EntityId[] {
  const validTaskIds = new Set(allTasks.map((t) => t.id));
  const union = new Set<EntityId>();
  for (const id of selectedIds) {
    if (!validTaskIds.has(id) || union.has(id)) continue;
    for (const descId of collectDescendantTaskIds(id, allTasks)) {
      union.add(descId);
    }
  }
  return Array.from(union);
}

export interface TaskSelectionState {
  selectedIds: EntityId[];
  anchorId: EntityId | null;
  focusedId: EntityId | null;
}

export type TaskSelectionAction =
  | { type: 'plain'; taskId: EntityId }
  | { type: 'toggle'; taskId: EntityId }
  | { type: 'range'; taskId: EntityId; additive?: boolean }
  | { type: 'arrow'; direction: 'up' | 'down'; extendRange?: boolean }
  | { type: 'selectAll' }
  | { type: 'clear' };

/**
 * Pure multi-selection & keyboard navigation state machine over flattened 3-level task IDs.
 */
export function computeTaskSelectionTransition(
  state: TaskSelectionState,
  action: TaskSelectionAction,
  orderedTaskIds: readonly EntityId[]
): TaskSelectionState {
  if (orderedTaskIds.length === 0) {
    return { selectedIds: [], anchorId: null, focusedId: null };
  }

  const indexById = new Map<EntityId, number>();
  for (let i = 0; i < orderedTaskIds.length; i++) {
    indexById.set(orderedTaskIds[i]!, i);
  }

  const cleanSelected = state.selectedIds.filter((id) => indexById.has(id));
  const validAnchor = state.anchorId && indexById.has(state.anchorId) ? state.anchorId : null;
  const validFocus = state.focusedId && indexById.has(state.focusedId) ? state.focusedId : null;

  if (action.type === 'clear') {
    return {
      selectedIds: [],
      anchorId: null,
      focusedId: validFocus,
    };
  }

  if (action.type === 'selectAll') {
    return {
      selectedIds: [...orderedTaskIds],
      anchorId: validAnchor ?? orderedTaskIds[0] ?? null,
      focusedId: validFocus ?? orderedTaskIds[0] ?? null,
    };
  }

  if (action.type === 'plain') {
    if (!indexById.has(action.taskId)) {
      return { selectedIds: cleanSelected, anchorId: validAnchor, focusedId: validFocus };
    }
    return {
      selectedIds: [action.taskId],
      anchorId: action.taskId,
      focusedId: action.taskId,
    };
  }

  if (action.type === 'toggle') {
    if (!indexById.has(action.taskId)) {
      return { selectedIds: cleanSelected, anchorId: validAnchor, focusedId: validFocus };
    }
    const exists = cleanSelected.includes(action.taskId);
    const nextIds = exists
      ? cleanSelected.filter((id) => id !== action.taskId)
      : [...cleanSelected, action.taskId];
    return {
      selectedIds: nextIds,
      anchorId: action.taskId,
      focusedId: action.taskId,
    };
  }

  if (action.type === 'range') {
    const targetIdx = indexById.get(action.taskId);
    if (targetIdx === undefined) {
      return { selectedIds: cleanSelected, anchorId: validAnchor, focusedId: validFocus };
    }
    const anchorId = validAnchor ?? action.taskId;
    const anchorIdx = indexById.get(anchorId) ?? targetIdx;
    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const slice = orderedTaskIds.slice(start, end + 1);
    const nextIds = action.additive
      ? Array.from(new Set([...cleanSelected, ...slice]))
      : slice;
    return {
      selectedIds: nextIds,
      anchorId,
      focusedId: action.taskId,
    };
  }

  // Keyboard ArrowUp / ArrowDown navigation with optional Shift range extension
  const baseId = validFocus ?? cleanSelected[cleanSelected.length - 1] ?? null;
  let nextIdx: number;
  if (!baseId) {
    nextIdx = action.direction === 'down' ? 0 : orderedTaskIds.length - 1;
  } else {
    const curIdx = indexById.get(baseId) ?? 0;
    const delta = action.direction === 'down' ? 1 : -1;
    nextIdx = Math.max(0, Math.min(orderedTaskIds.length - 1, curIdx + delta));
  }

  const nextId = orderedTaskIds[nextIdx]!;
  if (!action.extendRange) {
    return {
      selectedIds: [nextId],
      anchorId: nextId,
      focusedId: nextId,
    };
  }

  const anchorId = validAnchor ?? baseId ?? nextId;
  const anchorIdx = indexById.get(anchorId) ?? nextIdx;
  const start = Math.min(anchorIdx, nextIdx);
  const end = Math.max(anchorIdx, nextIdx);
  return {
    selectedIds: orderedTaskIds.slice(start, end + 1),
    anchorId,
    focusedId: nextId,
  };
}

/**
 * Returns true only when `node` and every child/grandchild descendant is marked `'done'`.
 */
export function isTaskBranchFullyDone(node: TaskTreeNode): boolean {
  if (node.task.status !== 'done') return false;
  return node.children.every((child) => isTaskBranchFullyDone(child));
}

export type TaskLinkFilter = 'all' | 'ado_linked' | 'unlinked' | 'has_deadline' | 'overdue';

export interface TaskFilterCriteria {
  query?: string;
  tagIds?: readonly EntityId[];
  includeUntagged?: boolean;
  linkFilter?: TaskLinkFilter;
  todayDateKey?: string;
}

/**
 * Tree-aware task filtering: keeps any parent or descendant matching criteria
 * and returns ancestor IDs that should auto-expand so deep matches remain visible.
 */
export function filterTaskTree(
  roots: readonly TaskTreeNode[],
  criteria: TaskFilterCriteria
): { roots: TaskTreeNode[]; autoExpandedIds: EntityId[] } {
  const q = (criteria.query ?? '').trim().toLowerCase();
  const tagIds = criteria.tagIds ?? [];
  const tagSet = new Set(tagIds);
  const includeUntagged = Boolean(criteria.includeUntagged);
  const linkFilter = criteria.linkFilter ?? 'all';
  const todayDateKey = criteria.todayDateKey ?? '';

  const hasFilter =
    q.length > 0 || tagSet.size > 0 || includeUntagged || linkFilter !== 'all';

  if (!hasFilter) {
    return { roots: [...roots], autoExpandedIds: [] };
  }

  const autoExpandedSet = new Set<EntityId>();

  const matchesSingleTask = (task: Task): boolean => {
    if (q) {
      const adoId = (task.externalWorkItemId ?? '').trim().toLowerCase();
      const haystacks = [
        task.name.toLowerCase(),
        (task.description ?? '').toLowerCase(),
        adoId,
        adoId ? `ab#${adoId}` : '',
        adoId ? `#${adoId}` : '',
        (task.externalWorkItemType ?? '').toLowerCase(),
      ];
      if (!haystacks.some((h) => h.includes(q))) {
        return false;
      }
    }

    if (tagSet.size > 0 || includeUntagged) {
      const taskTags = task.tagIds ?? [];
      const untaggedMatch = includeUntagged && taskTags.length === 0;
      const tagMatch = tagSet.size > 0 && taskTags.some((id) => tagSet.has(id));
      if (!untaggedMatch && !tagMatch) {
        return false;
      }
    }

    if (linkFilter === 'ado_linked' && !task.externalWorkItemId) return false;
    if (linkFilter === 'unlinked' && Boolean(task.externalWorkItemId)) return false;
    if (linkFilter === 'has_deadline' && !task.dueDate) return false;
    if (linkFilter === 'overdue') {
      if (
        !task.dueDate ||
        !todayDateKey ||
        classifyDueDateTone(task.dueDate, todayDateKey, task.status) !== 'overdue'
      ) {
        return false;
      }
    }

    return true;
  };

  const filterNode = (node: TaskTreeNode): TaskTreeNode | null => {
    const selfMatched = matchesSingleTask(node.task);
    const filteredChildren = node.children
      .map(filterNode)
      .filter((c): c is TaskTreeNode => c !== null);

    if (filteredChildren.length > 0) {
      autoExpandedSet.add(node.task.id);
      return {
        ...node,
        children: filteredChildren,
      };
    }

    if (selfMatched) {
      return {
        ...node,
        children: node.children,
      };
    }

    return null;
  };

  const filteredRoots = roots
    .map(filterNode)
    .filter((n): n is TaskTreeNode => n !== null);

  return {
    roots: filteredRoots,
    autoExpandedIds: Array.from(autoExpandedSet),
  };
}

/**
 * Pre-order traversal returning only visible nodes (omitting children of collapsed parents).
 */
export function flattenVisibleTaskTree(
  roots: readonly TaskTreeNode[],
  collapsedTaskIds: ReadonlySet<EntityId>
): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  function walk(nodes: readonly TaskTreeNode[]) {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length > 0 && !collapsedTaskIds.has(n.task.id)) {
        walk(n.children);
      }
    }
  }
  walk(roots);
  return out;
}

export const TASK_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface TaskPaginationWindow {
  items: TaskTreeNode[];
  totalItems: number;
  totalPages: number;
  pageIndex: number;
  pageNumber: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/**
 * Paginates top-level task trees by dynamic `pageSize` (defaulting to 10 root tasks).
 */
export function paginateTaskRoots(
  roots: readonly TaskTreeNode[],
  requestedPageIndex: number,
  requestedPageSize = 10
): TaskPaginationWindow {
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.floor(requestedPageSize)
      : 10;
  const totalItems = roots.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePageIndex = Math.min(
    Math.max(0, Number.isFinite(requestedPageIndex) ? Math.floor(requestedPageIndex) : 0),
    totalPages - 1
  );
  const startIndex = totalItems === 0 ? 0 : safePageIndex * pageSize;
  const items = roots.slice(startIndex, startIndex + pageSize);
  const endIndex = startIndex + items.length;

  return {
    items,
    totalItems,
    totalPages,
    pageIndex: safePageIndex,
    pageNumber: safePageIndex + 1,
    pageSize,
    startIndex,
    endIndex,
    hasPreviousPage: safePageIndex > 0,
    hasNextPage: safePageIndex < totalPages - 1,
  };
}

/**
 * Concise task badge label for Activity pickers:
 * - Multi-level ADO hierarchy -> `"AB#{ParentID} / {ChildID}"` (e.g. `"AB#31 / 3101"`)
 * - Single ADO link -> `"AB#{ID}"`
 * - Local / unplanned task -> leaf `task.name` only (never concatenating parent + child titles).
 */
export function formatCompactTaskLabel(task: Task, allTasks: readonly Task[]): string {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const chain: Task[] = [task];
  let current: Task | undefined = task;
  const visited = new Set<EntityId>([task.id]);

  while (current?.parentTaskId && !visited.has(current.parentTaskId)) {
    visited.add(current.parentTaskId);
    const parent = byId.get(current.parentTaskId);
    if (!parent || parent.projectId !== task.projectId) break;
    chain.unshift(parent);
    current = parent;
  }

  const adoIds: string[] = [];
  for (const node of chain) {
    const rawId = node.externalWorkItemId?.trim();
    if (rawId && !adoIds.includes(rawId)) {
      adoIds.push(rawId);
    }
  }

  if (adoIds.length >= 2) {
    return `AB#${adoIds[0]} / ${adoIds.slice(1).join(' / ')}`;
  }
  if (adoIds.length === 1) {
    return `AB#${adoIds[0]}`;
  }
  return task.name;
}

export interface TaskExportContext {
  allTasks: readonly Task[];
  projects: readonly Project[];
  tags: readonly ProjectTag[];
  trackedSecondsByTask?: ReadonlyMap<EntityId, number>;
  formatDuration?: (seconds: number) => string;
}

function defaultExportHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function csvCell(val: string | number): string {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function mdCell(val: string): string {
  return val.replaceAll('|', '\\|').replaceAll(/[\r\n]+/g, ' ').trim();
}

/**
 * Formats selected tasks into a GitHub-Flavored Markdown table for clipboard export.
 */
export function tasksToMarkdownTable(
  selectedTasks: readonly Task[],
  ctx: TaskExportContext
): string {
  const fmt = ctx.formatDuration ?? defaultExportHMS;
  const tagMap = buildTagNameMap(ctx.tags);

  const lines = [
    '| Work Item | Task | Status | Tags | Deadline | Tracked |',
    '| --- | --- | --- | --- | --- | ---: |',
  ];

  for (const task of selectedTasks) {
    const workItem = task.externalWorkItemId ? `AB#${task.externalWorkItemId}` : '—';
    const tagsStr = resolveTagNames(task.tagIds ?? [], tagMap).join(', ') || '—';
    const deadline = task.dueDate || '—';
    const secs = ctx.trackedSecondsByTask?.get(task.id) ?? 0;
    const tracked = secs > 0 ? fmt(secs) : '00:00:00';
    const indentPrefix =
      task.depth === 1 ? '↳ ' : task.depth === 2 ? '↳↳ ' : '';
    lines.push(
      `| ${mdCell(workItem)} | ${mdCell(`${indentPrefix}${task.name}`)} | ${mdCell(task.status)} | ${mdCell(tagsStr)} | ${mdCell(deadline)} | ${tracked} |`
    );
  }

  return lines.join('\n');
}

/**
 * Formats selected tasks into an Excel-compatible UTF-8 BOM CSV string.
 */
export function tasksToCsv(selectedTasks: readonly Task[], ctx: TaskExportContext): string {
  const fmt = ctx.formatDuration ?? defaultExportHMS;
  const tagMap = buildTagNameMap(ctx.tags);
  const projectMap = new Map(ctx.projects.map((p) => [p.id, p]));
  const taskMap = new Map(ctx.allTasks.map((t) => [t.id, t]));

  const headers = [
    'Work Item',
    'Type',
    'Parent',
    'Task',
    'Status',
    'Project',
    'Tags',
    'Deadline',
    'Tracked Duration',
    'ADO Completed Hours',
  ];

  const rows: string[] = [headers.map(csvCell).join(',')];

  for (const task of selectedTasks) {
    const parent = task.parentTaskId ? taskMap.get(task.parentTaskId) : undefined;
    const proj = projectMap.get(task.projectId);
    const secs = ctx.trackedSecondsByTask?.get(task.id) ?? 0;
    const tagsStr = resolveTagNames(task.tagIds ?? [], tagMap).join(', ');
    rows.push(
      [
        task.externalWorkItemId ? `#${task.externalWorkItemId}` : '',
        task.externalWorkItemType ?? '',
        parent?.name ?? '',
        task.name,
        task.status,
        proj?.name ?? '',
        tagsStr,
        task.dueDate ?? '',
        fmt(secs),
        task.completedWorkHours ?? 0,
      ]
        .map(csvCell)
        .join(',')
    );
  }

  return `\uFEFF${rows.join('\r\n')}`;
}

