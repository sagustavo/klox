import type { EntityId, Project, ProjectTag, Task, TaskDepth } from './types';

export const UNASSIGNED_PROJECT_ID: EntityId = 'system_unassigned';

export const MAX_TASK_DEPTH: TaskDepth = 2; // 0 = Task, 1 = Subtask, 2 = Sub-subtask
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

