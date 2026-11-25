import Papa from 'papaparse';
import { formatHMS, normalizeDescription, parseHMS } from './duration';
import { deterministicLogId } from './ids';
import { buildTagNameMap, resolveTagNames } from './invariants';
import type { EntityId, Project, ProjectTag, TimeLog } from './types';

/**
 * Official Toggl Track English CSV Headers (GEMINI.md §3.5).
 * Always kept in English regardless of UI locale (interop contract — ADR-0005).
 */
export const TOGGL_CSV_HEADERS = [
  'User',
  'Email',
  'Client',
  'Project',
  'Task',
  'Description',
  'Billable',
  'Start date',
  'Start time',
  'End date',
  'End time',
  'Duration',
  'Tags',
] as const;

export type TogglRowImportStatus = 'pending' | 'imported';

export interface ParsedTogglLogRow {
  rowNumber: number;
  deterministicId: EntityId;
  description: string;
  normalizedDescription: string;
  projectName: string; // Empty string means fallback "General / Unassigned"
  taskName: string;
  tagNames: string[];
  isBillable: boolean;
  startTimeUTC: string;
  endTimeUTC: string;
  durationSeconds: number;
  startDateKey: string; // "YYYY-MM-DD"
  importStatus: TogglRowImportStatus;
}

export interface ParsedTogglMetadataRow {
  rowNumber: number;
  projectName: string;
  tagNames: string[];
}

export interface TogglRowError {
  rowNumber: number;
  code: 'MISSING_FIELDS' | 'INVALID_DATE_OR_TIME' | 'INVALID_DURATION';
}

export interface TogglDryRunPreview {
  logRows: ParsedTogglLogRow[];
  metadataRows: ParsedTogglMetadataRow[];
  errors: TogglRowError[];
  newProjectNames: string[];
  newScopedTags: Array<{ projectName: string; tagName: string }>;
  newLogsCount: number;
  duplicateLogsCount: number;
}

export const TOGGL_UNASSIGNED_FILTER_VALUE = '__klox_unassigned__';
export const TOGGL_UNTAGGED_FILTER_VALUE = '__klox_untagged__';

export interface TogglPreviewFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface TogglPreviewFilterOptions {
  statuses: TogglPreviewFilterOption[];
  dates: TogglPreviewFilterOption[];
  descriptions: TogglPreviewFilterOption[];
  projects: TogglPreviewFilterOption[];
  tags: TogglPreviewFilterOption[];
}

export interface TogglPreviewFilterLabels {
  pending?: string;
  imported?: string;
  unassigned?: string;
  untagged?: string;
  noDescription?: string;
}

export interface TogglPreviewColumnFilters {
  statuses: TogglRowImportStatus[];
  dates: string[];
  descriptions: string[];
  projects: string[];
  tags: string[];
}

export function createEmptyTogglPreviewFilters(): TogglPreviewColumnFilters {
  return {
    statuses: [],
    dates: [],
    descriptions: [],
    projects: [],
    tags: [],
  };
}

export function hasActiveTogglPreviewFilters(filters: TogglPreviewColumnFilters): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.dates.length > 0 ||
    filters.descriptions.length > 0 ||
    filters.projects.length > 0 ||
    filters.tags.length > 0
  );
}

/**
 * Extracts per-column multi-select filter options and row counts in a single O(N) pass.
 */
export function extractTogglPreviewFilterOptions(
  rows: readonly ParsedTogglLogRow[],
  labels: TogglPreviewFilterLabels = {}
): TogglPreviewFilterOptions {
  const pendingLabel = labels.pending ?? 'Pending';
  const importedLabel = labels.imported ?? 'Imported';
  const unassignedLabel = labels.unassigned ?? 'General / Unassigned';
  const untaggedLabel = labels.untagged ?? 'Untagged';
  const noDescriptionLabel = labels.noDescription ?? '(No description)';

  let pendingCount = 0;
  let importedCount = 0;
  const dateCounts = new Map<string, number>();
  const descCounts = new Map<string, number>();
  const projectCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  let unassignedCount = 0;
  let untaggedCount = 0;

  for (const row of rows) {
    if (row.importStatus === 'imported') {
      importedCount++;
    } else {
      pendingCount++;
    }

    if (row.startDateKey) {
      dateCounts.set(row.startDateKey, (dateCounts.get(row.startDateKey) ?? 0) + 1);
    }

    descCounts.set(row.description, (descCounts.get(row.description) ?? 0) + 1);

    if (row.projectName) {
      projectCounts.set(row.projectName, (projectCounts.get(row.projectName) ?? 0) + 1);
    } else {
      unassignedCount++;
    }

    if (row.tagNames.length === 0) {
      untaggedCount++;
    } else {
      const seenTags = new Set(row.tagNames);
      for (const tag of seenTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  const statuses: TogglPreviewFilterOption[] = [];
  if (pendingCount > 0) {
    statuses.push({ value: 'pending', label: pendingLabel, count: pendingCount });
  }
  if (importedCount > 0) {
    statuses.push({ value: 'imported', label: importedLabel, count: importedCount });
  }

  const dates: TogglPreviewFilterOption[] = Array.from(dateCounts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([value, count]) => ({ value, label: value, count }));

  const descriptions: TogglPreviewFilterOption[] = Array.from(descCounts.entries())
    .map(([value, count]) => ({
      value,
      label: value || noDescriptionLabel,
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  const projects: TogglPreviewFilterOption[] = Array.from(projectCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([value, count]) => ({ value, label: value, count }));
  if (unassignedCount > 0) {
    projects.push({
      value: TOGGL_UNASSIGNED_FILTER_VALUE,
      label: unassignedLabel,
      count: unassignedCount,
    });
  }

  const tags: TogglPreviewFilterOption[] = Array.from(tagCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([value, count]) => ({ value, label: value, count }));
  if (untaggedCount > 0) {
    tags.push({
      value: TOGGL_UNTAGGED_FILTER_VALUE,
      label: untaggedLabel,
      count: untaggedCount,
    });
  }

  return { statuses, dates, descriptions, projects, tags };
}

export function filterTogglPreviewRows(
  rows: readonly ParsedTogglLogRow[],
  filters: TogglPreviewColumnFilters
): ParsedTogglLogRow[] {
  if (!hasActiveTogglPreviewFilters(filters)) return [...rows];

  const statusSet = new Set<string>(filters.statuses);
  const dateSet = new Set<string>(filters.dates);
  const descSet = new Set<string>(filters.descriptions);
  const projectSet = new Set<string>(filters.projects);
  const tagSet = new Set<string>(filters.tags);

  return rows.filter((row) => {
    if (statusSet.size > 0 && !statusSet.has(row.importStatus)) return false;
    if (dateSet.size > 0 && !dateSet.has(row.startDateKey)) return false;
    if (descSet.size > 0 && !descSet.has(row.description)) return false;

    if (projectSet.size > 0) {
      const projectKey = row.projectName || TOGGL_UNASSIGNED_FILTER_VALUE;
      if (!projectSet.has(projectKey)) return false;
    }

    if (tagSet.size > 0) {
      if (row.tagNames.length === 0) {
        if (!tagSet.has(TOGGL_UNTAGGED_FILTER_VALUE)) return false;
      } else if (!row.tagNames.some((tag) => tagSet.has(tag))) {
        return false;
      }
    }

    return true;
  });
}

export function buildTogglCompositeKey(params: {
  startTimeUTC: string;
  durationSeconds: number;
  normalizedDescription: string;
  projectName: string;
}): string {
  return `${params.startTimeUTC}|${params.durationSeconds}|${params.normalizedDescription}|${(params.projectName || 'General / Unassigned').trim().toLowerCase()}`;
}

export function parseTogglBillable(raw: string | undefined): boolean {
  if (!raw) return false;
  const norm = raw.trim().toLowerCase();
  return norm === 'yes' || norm === 'true' || norm === '1';
}

export function splitTogglTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function computePreviewCatalogAndStatuses(params: {
  logRows: readonly ParsedTogglLogRow[];
  metadataRows: readonly ParsedTogglMetadataRow[];
  existingProjects: readonly Project[];
  existingTags: readonly ProjectTag[];
  existingLogs: readonly TimeLog[];
}): {
  logRows: ParsedTogglLogRow[];
  newProjectNames: string[];
  newScopedTags: Array<{ projectName: string; tagName: string }>;
  newLogsCount: number;
  duplicateLogsCount: number;
} {
  const existingProjectsByLower = new Map<string, Project>();
  const existingProjectsById = new Map<string, Project>();
  for (const p of params.existingProjects) {
    existingProjectsByLower.set(p.name.trim().toLowerCase(), p);
    existingProjectsById.set(p.id, p);
  }

  const newProjectNamesSet = new Set<string>();
  const newScopedTagsMap = new Map<string, { projectName: string; tagName: string }>();

  const existingTagsByProjAndName = new Set<string>();
  for (const t of params.existingTags) {
    const owner = existingProjectsById.get(t.projectId);
    const ownerNameLower = (owner?.name ?? 'General / Unassigned').trim().toLowerCase();
    existingTagsByProjAndName.add(`${ownerNameLower}::${t.name.trim().toLowerCase()}`);
  }

  for (const r of params.logRows) {
    const trimmedProj = r.projectName.trim();
    if (
      trimmedProj &&
      trimmedProj.toLowerCase() !== 'general / unassigned' &&
      !existingProjectsByLower.has(trimmedProj.toLowerCase())
    ) {
      newProjectNamesSet.add(trimmedProj);
    }

    const resolvedProjLabel = trimmedProj || 'General / Unassigned';
    const resolvedProjLower = resolvedProjLabel.toLowerCase();

    for (const tag of r.tagNames) {
      const key = `${resolvedProjLower}::${tag.toLowerCase()}`;
      if (!existingTagsByProjAndName.has(key) && !newScopedTagsMap.has(key)) {
        newScopedTagsMap.set(key, {
          projectName: resolvedProjLabel,
          tagName: tag,
        });
      }
    }
  }

  for (const item of params.metadataRows) {
    const trimmedProj = item.projectName.trim();
    if (
      trimmedProj &&
      trimmedProj.toLowerCase() !== 'general / unassigned' &&
      !existingProjectsByLower.has(trimmedProj.toLowerCase())
    ) {
      newProjectNamesSet.add(trimmedProj);
    }

    const resolvedProjLabel = trimmedProj || 'General / Unassigned';
    const resolvedProjLower = resolvedProjLabel.toLowerCase();

    for (const tag of item.tagNames) {
      const key = `${resolvedProjLower}::${tag.toLowerCase()}`;
      if (!existingTagsByProjAndName.has(key) && !newScopedTagsMap.has(key)) {
        newScopedTagsMap.set(key, {
          projectName: resolvedProjLabel,
          tagName: tag,
        });
      }
    }
  }

  const existingLogIdSet = new Set(params.existingLogs.map((l) => l.id));
  const existingCompositeSet = new Set(
    params.existingLogs.map((l) =>
      buildTogglCompositeKey({
        startTimeUTC: l.startTime,
        durationSeconds: l.durationSeconds,
        normalizedDescription: l.normalizedDescription,
        projectName: l.projectNameSnapshot,
      })
    )
  );

  let newLogsCount = 0;
  let duplicateLogsCount = 0;
  const resolvedRows: ParsedTogglLogRow[] = new Array(params.logRows.length);

  for (let i = 0; i < params.logRows.length; i++) {
    const row = params.logRows[i]!;
    const composite = buildTogglCompositeKey({
      startTimeUTC: row.startTimeUTC,
      durationSeconds: row.durationSeconds,
      normalizedDescription: row.normalizedDescription,
      projectName: row.projectName,
    });
    const isDuplicate =
      existingLogIdSet.has(row.deterministicId) || existingCompositeSet.has(composite);
    const importStatus: TogglRowImportStatus = isDuplicate ? 'imported' : 'pending';
    if (isDuplicate) {
      duplicateLogsCount += 1;
    } else {
      newLogsCount += 1;
    }
    resolvedRows[i] = row.importStatus === importStatus ? row : { ...row, importStatus };
  }

  return {
    logRows: resolvedRows,
    newProjectNames: Array.from(newProjectNamesSet),
    newScopedTags: Array.from(newScopedTagsMap.values()),
    newLogsCount,
    duplicateLogsCount,
  };
}

/**
 * Parses a Toggl Track CSV string and produces a complete Dry-Run Preview against the user's catalog and logs.
 * Processes validation and SHA-256 deterministic ID hashing in yieldable chunks so 3,000+ rows never block UI painting.
 */
export async function parseAndPreviewTogglCsv(params: {
  csvText: string;
  existingProjects: readonly Project[];
  existingTags: readonly ProjectTag[];
  existingLogs: readonly TimeLog[];
  chunkSize?: number;
  onProgress?: (processed: number, total: number) => void;
}): Promise<TogglDryRunPreview> {
  const cleanText = params.csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return {
      logRows: [],
      metadataRows: [],
      errors: [],
      newProjectNames: [],
      newScopedTags: [],
      newLogsCount: 0,
      duplicateLogsCount: 0,
    };
  }

  const parsed = Papa.parse<Record<string, string>>(cleanText, {
    header: true,
    skipEmptyLines: true,
  });

  const totalRows = parsed.data.length;
  const chunkSize = Math.max(50, Math.floor(params.chunkSize ?? 250));
  const logRows: ParsedTogglLogRow[] = [];
  const metadataRows: ParsedTogglMetadataRow[] = [];
  const errors: TogglRowError[] = [];
  const seenDeterministicIds = new Set<string>();

  if (totalRows > 0) {
    params.onProgress?.(0, totalRows);
  }

  for (let start = 0; start < totalRows; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalRows);
    const candidateRows: Array<Omit<ParsedTogglLogRow, 'deterministicId' | 'importStatus'>> = [];

    for (let i = start; i < end; i++) {
      const row = parsed.data[i] ?? {};
      const rowNumber = i + 2; // 1-indexed + header row

      const projectName = (row['Project'] ?? '').trim();
      const taskName = (row['Task'] ?? '').trim();
      const description = (row['Description'] ?? '').trim();
      const startDate = (row['Start date'] ?? '').trim();
      const startTime = (row['Start time'] ?? '').trim();
      const endDate = (row['End date'] ?? '').trim();
      const endTime = (row['End time'] ?? '').trim();
      const durationStr = (row['Duration'] ?? '').trim();
      const tagNames = splitTogglTags(row['Tags']);
      const isBillable = parseTogglBillable(row['Billable']);

      const hasTimingFields = Boolean(startDate || startTime || durationStr);

      // Standalone metadata row (only Project and/or Tags populated)
      if (!hasTimingFields && !description && (projectName || tagNames.length > 0)) {
        metadataRows.push({
          rowNumber,
          projectName,
          tagNames,
        });
        continue;
      }

      if (!startDate || !startTime || !durationStr) {
        errors.push({ rowNumber, code: 'MISSING_FIELDS' });
        continue;
      }

      if (!DATE_RE.test(startDate) || !TIME_RE.test(startTime)) {
        errors.push({ rowNumber, code: 'INVALID_DATE_OR_TIME' });
        continue;
      }

      const durationSeconds = parseHMS(durationStr);
      if (durationSeconds === null || durationSeconds < 0) {
        errors.push({ rowNumber, code: 'INVALID_DURATION' });
        continue;
      }

      const normalizedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const startInstant = new Date(`${startDate}T${normalizedStartTime}Z`);
      if (Number.isNaN(startInstant.getTime())) {
        errors.push({ rowNumber, code: 'INVALID_DATE_OR_TIME' });
        continue;
      }

      const startTimeUTC = startInstant.toISOString();
      let endTimeUTC = new Date(startInstant.getTime() + durationSeconds * 1000).toISOString();

      if (endDate && endTime && DATE_RE.test(endDate) && TIME_RE.test(endTime)) {
        const normEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;
        const candidateEnd = new Date(`${endDate}T${normEndTime}Z`);
        if (!Number.isNaN(candidateEnd.getTime()) && candidateEnd >= startInstant) {
          endTimeUTC = candidateEnd.toISOString();
        }
      }

      const finalDesc = description || taskName || projectName || 'Imported entry';
      const normalizedDesc = normalizeDescription(finalDesc);

      candidateRows.push({
        rowNumber,
        description: finalDesc,
        normalizedDescription: normalizedDesc,
        projectName,
        taskName,
        tagNames,
        isBillable,
        startTimeUTC,
        endTimeUTC,
        durationSeconds,
        startDateKey: startDate,
      });
    }

    if (candidateRows.length > 0) {
      const computedIds = await Promise.all(
        candidateRows.map((c) =>
          deterministicLogId({
            startTimeUTC: c.startTimeUTC,
            durationSeconds: c.durationSeconds,
            normalizedDescription: c.normalizedDescription,
            projectName: c.projectName || 'General / Unassigned',
          })
        )
      );

      for (let j = 0; j < candidateRows.length; j++) {
        const detId = computedIds[j]!;
        if (seenDeterministicIds.has(detId)) continue;
        seenDeterministicIds.add(detId);
        logRows.push({
          ...candidateRows[j]!,
          deterministicId: detId,
          importStatus: 'pending',
        });
      }
    }

    params.onProgress?.(end, totalRows);
    if (totalRows > chunkSize && end < totalRows) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const computed = computePreviewCatalogAndStatuses({
    logRows,
    metadataRows,
    existingProjects: params.existingProjects,
    existingTags: params.existingTags,
    existingLogs: params.existingLogs,
  });

  return {
    logRows: computed.logRows,
    metadataRows,
    errors,
    newProjectNames: computed.newProjectNames,
    newScopedTags: computed.newScopedTags,
    newLogsCount: computed.newLogsCount,
    duplicateLogsCount: computed.duplicateLogsCount,
  };
}

/**
 * Re-computes import statuses and counts on an already-parsed preview in O(N)
 * without re-running PapaParse or SHA-256 hashing.
 */
export function refreshTogglPreviewStatuses(params: {
  preview: TogglDryRunPreview;
  existingProjects: readonly Project[];
  existingTags: readonly ProjectTag[];
  existingLogs: readonly TimeLog[];
}): TogglDryRunPreview {
  const computed = computePreviewCatalogAndStatuses({
    logRows: params.preview.logRows,
    metadataRows: params.preview.metadataRows,
    existingProjects: params.existingProjects,
    existingTags: params.existingTags,
    existingLogs: params.existingLogs,
  });

  return {
    ...params.preview,
    logRows: computed.logRows,
    newProjectNames: computed.newProjectNames,
    newScopedTags: computed.newScopedTags,
    newLogsCount: computed.newLogsCount,
    duplicateLogsCount: computed.duplicateLogsCount,
  };
}

/**
 * Exports TimeLogs into an official Toggl Track CSV string prefixed with UTF-8 BOM (`\uFEFF`) for Excel compatibility.
 */
export function serializeTogglCsv(params: {
  logs: readonly TimeLog[];
  userName?: string | null;
  userEmail?: string | null;
  tags?: readonly Pick<ProjectTag, 'id' | 'name'>[];
}): string {
  const userName = params.userName || 'Klox User';
  const userEmail = params.userEmail || 'user@klox.dev';
  const tagNameById = params.tags ? buildTagNameMap(params.tags) : undefined;

  const rows = params.logs.map((log) => {
    const startIso = new Date(log.startTime).toISOString();
    const endIso = new Date(log.endTime).toISOString();

    const startDate = startIso.slice(0, 10);
    const startTime = startIso.slice(11, 19);
    const endDate = endIso.slice(0, 10);
    const endTime = endIso.slice(11, 19);

    return {
      User: userName,
      Email: userEmail,
      Client: '',
      Project: log.projectNameSnapshot,
      Task: log.taskNameSnapshot ?? '',
      Description: log.description,
      Billable: log.isBillable ? 'Yes' : 'No',
      'Start date': startDate,
      'Start time': startTime,
      'End date': endDate,
      'End time': endTime,
      Duration: formatHMS(log.durationSeconds),
      Tags: tagNameById ? resolveTagNames(log.tagIds, tagNameById).join(', ') : log.tagIds.join(', '),
    };
  });

  const csvBody = Papa.unparse(rows, {
    columns: [...TOGGL_CSV_HEADERS],
  });

  return `\uFEFF${csvBody}`;
}
