import type { EntityId, Project, ProjectTag, Task, TaskDepth } from './types';

export const UNASSIGNED_PROJECT_ID: EntityId = 'system_unassigned';

export const MAX_TASK_DEPTH: TaskDepth = 2; // 0 = Task, 1 = Subtask, 2 = Sub-subtask

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
 * Builds a 3-level sorted tree of Tasks -> Subtasks -> Sub-subtasks for a Project.
 */
export function buildTaskTree(
  allTasks: readonly Task[],
  projectId: EntityId | null | undefined
): TaskTreeNode[] {
  if (!projectId) return [];
  const projectTasks = allTasks
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));

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

