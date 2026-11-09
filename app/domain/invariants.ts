import type { EntityId, Project, ProjectTag } from './types';

export const UNASSIGNED_PROJECT_ID: EntityId = 'system_unassigned';

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
