import { normalizeDescription } from './duration';
import { UNASSIGNED_PROJECT_ID, tagsForProject } from './invariants';
import type { EntityId, Project, ProjectTag, TimeLog } from './types';

export interface RecallTemplate {
  key: string; // `${normalizedDescription}::${projectId}`
  description: string;
  normalizedDescription: string;
  projectId: EntityId;
  projectNameSnapshot: string;
  projectColorSnapshot: string;
  tagIds: EntityId[];
  isBillable: boolean;
  frequency: number;
  lastUsedTime: string; // UTC ISO
}

/**
 * Deduplicates historical TimeLogs into unique task templates (`normalizedDescription + projectId`),
 * ranked by recency and frequency for <2ms Fuse.js recall (GEMINI.md §3.3).
 */
export function buildRecallTemplates(logs: readonly TimeLog[]): RecallTemplate[] {
  const map = new Map<string, RecallTemplate>();

  for (const log of logs) {
    const norm = log.normalizedDescription || normalizeDescription(log.description);
    if (!norm) continue;
    const key = `${norm}::${log.projectId}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        description: log.description.trim(),
        normalizedDescription: norm,
        projectId: log.projectId,
        projectNameSnapshot: log.projectNameSnapshot,
        projectColorSnapshot: log.projectColorSnapshot,
        tagIds: [...log.tagIds],
        isBillable: log.isBillable,
        frequency: 1,
        lastUsedTime: log.startTime,
      });
    } else {
      existing.frequency += 1;
      if (log.startTime > existing.lastUsedTime) {
        existing.description = log.description.trim();
        existing.tagIds = [...log.tagIds];
        existing.isBillable = log.isBillable;
        existing.lastUsedTime = log.startTime;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return b.lastUsedTime.localeCompare(a.lastUsedTime);
  });
}

export interface AiAutofillPrediction {
  projectId: EntityId;
  tagIds: EntityId[];
  isBillable: boolean;
}

/**
 * Server-side & client-side domain invariant enforcement for AI Auto-Fill predictions (ADR-0004):
 * - Ensures `projectId` exists in the user's catalog (falls back to `UNASSIGNED_PROJECT_ID` or first project).
 * - Filters `tagIds` so ONLY tags owned by that `projectId` are kept.
 */
export function validateAiPrediction(params: {
  raw: Partial<AiAutofillPrediction> | null | undefined;
  projects: readonly Project[];
  tags: readonly ProjectTag[];
}): AiAutofillPrediction {
  const { raw, projects, tags } = params;
  const fallbackProject =
    projects.find((p) => p.id === raw?.projectId) ??
    projects.find((p) => p.systemKey === 'unassigned' || p.id === UNASSIGNED_PROJECT_ID) ??
    projects[0];

  const resolvedProjectId = fallbackProject?.id ?? UNASSIGNED_PROJECT_ID;
  const validProjectTags = new Set(tagsForProject(tags, resolvedProjectId).map((t) => t.id));

  const candidateTags = Array.isArray(raw?.tagIds) ? raw.tagIds : [];
  const filteredTags = candidateTags.filter(
    (id): id is string => typeof id === 'string' && validProjectTags.has(id)
  );

  const isBillable =
    typeof raw?.isBillable === 'boolean'
      ? raw.isBillable
      : Boolean(fallbackProject?.isBillableDefault);

  return {
    projectId: resolvedProjectId,
    tagIds: Array.from(new Set(filteredTags)),
    isBillable,
  };
}

/**
 * Deterministic lexical fallback scorer when Gemini API key is not configured locally.
 * Matches words in the description against project names and project-scoped tag names.
 */
export function heuristicCatalogPredict(params: {
  description: string;
  projects: readonly Project[];
  tags: readonly ProjectTag[];
}): AiAutofillPrediction {
  const norm = normalizeDescription(params.description);
  const tokens = norm.split(/[^a-z0-9#]+/).filter((w) => w.length >= 2);

  let bestProject: Project | undefined;
  let bestScore = 0;

  for (const proj of params.projects) {
    if (proj.systemKey === 'unassigned') continue;
    let score = 0;
    const pNorm = normalizeDescription(proj.name);
    if (norm.includes(pNorm)) score += 5;
    for (const tok of tokens) {
      if (pNorm.includes(tok)) score += 2;
    }
    const pTags = tagsForProject(params.tags, proj.id);
    for (const tag of pTags) {
      const tNorm = normalizeDescription(tag.name);
      if (norm.includes(tNorm) || tokens.includes(tNorm)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestProject = proj;
    }
  }

  const chosenProject =
    bestProject ??
    params.projects.find((p) => p.systemKey !== 'unassigned') ??
    params.projects[0];

  const projectId = chosenProject?.id ?? UNASSIGNED_PROJECT_ID;
  const scoped = tagsForProject(params.tags, projectId);
  const matchedTagIds = scoped
    .filter((tag) => {
      const tNorm = normalizeDescription(tag.name);
      return norm.includes(tNorm) || tokens.some((tok) => tNorm.includes(tok));
    })
    .map((t) => t.id);

  return validateAiPrediction({
    raw: {
      projectId,
      tagIds: matchedTagIds,
      isBillable: chosenProject?.isBillableDefault ?? false,
    },
    projects: params.projects,
    tags: params.tags,
  });
}
