import Papa from 'papaparse';
import { formatHMS, normalizeDescription, parseHMS } from './duration';
import { deterministicLogId } from './ids';
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

/**
 * Parses a Toggl Track CSV string and produces a complete Dry-Run Preview against the user's catalog and logs.
 */
export async function parseAndPreviewTogglCsv(params: {
  csvText: string;
  existingProjects: readonly Project[];
  existingTags: readonly ProjectTag[];
  existingLogs: readonly TimeLog[];
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

  const logRows: ParsedTogglLogRow[] = [];
  const metadataRows: ParsedTogglMetadataRow[] = [];
  const errors: TogglRowError[] = [];
  const seenDeterministicIds = new Set<string>();

  for (let i = 0; i < parsed.data.length; i++) {
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

    const detId = await deterministicLogId({
      startTimeUTC,
      durationSeconds,
      normalizedDescription: normalizedDesc,
      projectName: projectName || 'General / Unassigned',
    });

    if (seenDeterministicIds.has(detId)) {
      continue;
    }
    seenDeterministicIds.add(detId);

    logRows.push({
      rowNumber,
      deterministicId: detId,
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

  // Compute new projects & new project-scoped tags that will be created
  const existingProjectsByLower = new Map<string, Project>();
  for (const p of params.existingProjects) {
    existingProjectsByLower.set(p.name.trim().toLowerCase(), p);
  }

  const newProjectNamesSet = new Set<string>();
  const newScopedTagsMap = new Map<string, { projectName: string; tagName: string }>();

  const existingTagsByProjAndName = new Set<string>();
  for (const t of params.existingTags) {
    const owner = params.existingProjects.find((p) => p.id === t.projectId);
    const ownerNameLower = (owner?.name ?? 'General / Unassigned').trim().toLowerCase();
    existingTagsByProjAndName.add(`${ownerNameLower}::${t.name.trim().toLowerCase()}`);
  }

  const allRowsForCatalog = [
    ...logRows.map((r) => ({ projectName: r.projectName, tagNames: r.tagNames })),
    ...metadataRows,
  ];

  for (const item of allRowsForCatalog) {
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
    params.existingLogs.map(
      (l) =>
        `${l.startTime}|${l.durationSeconds}|${l.normalizedDescription}|${l.projectNameSnapshot.trim().toLowerCase()}`
    )
  );

  let newLogsCount = 0;
  let duplicateLogsCount = 0;
  for (const row of logRows) {
    const composite = `${row.startTimeUTC}|${row.durationSeconds}|${row.normalizedDescription}|${(row.projectName || 'General / Unassigned').trim().toLowerCase()}`;
    if (existingLogIdSet.has(row.deterministicId) || existingCompositeSet.has(composite)) {
      duplicateLogsCount += 1;
    } else {
      newLogsCount += 1;
    }
  }

  return {
    logRows,
    metadataRows,
    errors,
    newProjectNames: Array.from(newProjectNamesSet),
    newScopedTags: Array.from(newScopedTagsMap.values()),
    newLogsCount,
    duplicateLogsCount,
  };
}

/**
 * Exports TimeLogs into an official Toggl Track CSV string prefixed with UTF-8 BOM (`\uFEFF`) for Excel compatibility.
 */
export function serializeTogglCsv(params: {
  logs: readonly TimeLog[];
  userName?: string | null;
  userEmail?: string | null;
}): string {
  const userName = params.userName || 'Klox User';
  const userEmail = params.userEmail || 'user@klox.dev';

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
      Tags: log.tagNamesSnapshot.join(', '),
    };
  });

  const csvBody = Papa.unparse(rows, {
    columns: [...TOGGL_CSV_HEADERS],
  });

  return `\uFEFF${csvBody}`;
}
