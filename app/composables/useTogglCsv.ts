import { publishDomainEvent } from '~/domain/events';
import { UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import {
  parseAndPreviewTogglCsv,
  serializeTogglCsv,
  type TogglDryRunPreview,
} from '~/domain/toggl';
import type { EntityId, Project, ProjectTag, TimeLog } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimeLogsStore } from '~/stores/timeLogs';

export function useTogglCsv() {
  const authStore = useAuthStore();
  const catalogStore = useCatalogStore();
  const timeLogsStore = useTimeLogsStore();

  const isCommitting = ref(false);

  async function buildPreview(csvText: string): Promise<TogglDryRunPreview> {
    return parseAndPreviewTogglCsv({
      csvText,
      existingProjects: catalogStore.projects,
      existingTags: catalogStore.tags,
      existingLogs: timeLogsStore.logs,
    });
  }

  async function commitPreview(preview: TogglDryRunPreview): Promise<{
    createdProjects: number;
    createdTags: number;
    importedLogs: number;
    skippedDuplicates: number;
  }> {
    const uid = authStore.user?.uid ?? 'demo-user';
    const isDemo = authStore.isDemoMode;

    isCommitting.value = true;
    try {
      let createdProjects = 0;
      let createdTags = 0;
      let importedLogs = 0;
      let skippedDuplicates = 0;

      // 1. Ensure all projects exist
      const projectByLower = new Map<string, Project>();
      for (const p of catalogStore.projects) {
        projectByLower.set(p.name.trim().toLowerCase(), p);
      }

      for (const projName of preview.newProjectNames) {
        const lower = projName.trim().toLowerCase();
        if (!projectByLower.has(lower)) {
          const created = await catalogStore.createProject({
            uid,
            isDemo,
            name: projName,
            isBillableDefault: false,
          });
          projectByLower.set(lower, created);
          createdProjects += 1;
        }
      }

      const resolveProjectId = (rawName: string): EntityId => {
        const trimmed = rawName.trim();
        if (!trimmed || trimmed.toLowerCase() === 'general / unassigned') {
          return UNASSIGNED_PROJECT_ID;
        }
        return projectByLower.get(trimmed.toLowerCase())?.id ?? UNASSIGNED_PROJECT_ID;
      };

      // 2. Ensure all project-scoped tags exist
      const tagByProjAndLower = new Map<string, ProjectTag>();
      for (const t of catalogStore.tags) {
        tagByProjAndLower.set(`${t.projectId}::${t.name.trim().toLowerCase()}`, t);
      }

      for (const scopedTag of preview.newScopedTags) {
        const projectId = resolveProjectId(scopedTag.projectName);
        const key = `${projectId}::${scopedTag.tagName.trim().toLowerCase()}`;
        if (!tagByProjAndLower.has(key)) {
          const created = await catalogStore.createTag({
            uid,
            isDemo,
            projectId,
            name: scopedTag.tagName,
          });
          tagByProjAndLower.set(key, created);
          createdTags += 1;
        }
      }

      // 3. Commit non-duplicate TimeLog rows
      const existingIds = new Set(timeLogsStore.logs.map((l) => l.id));
      const existingComposites = new Set(
        timeLogsStore.logs.map(
          (l) =>
            `${l.startTime}|${l.durationSeconds}|${l.normalizedDescription}|${l.projectNameSnapshot.trim().toLowerCase()}`
        )
      );

      for (const row of preview.logRows) {
        const composite = `${row.startTimeUTC}|${row.durationSeconds}|${row.normalizedDescription}|${(row.projectName || 'General / Unassigned').trim().toLowerCase()}`;
        if (existingIds.has(row.deterministicId) || existingComposites.has(composite)) {
          skippedDuplicates += 1;
          continue;
        }

        const projectId = resolveProjectId(row.projectName);
        const tagIds: EntityId[] = [];
        for (const tagName of row.tagNames) {
          const tag = tagByProjAndLower.get(`${projectId}::${tagName.trim().toLowerCase()}`);
          if (tag) tagIds.push(tag.id);
        }

        await timeLogsStore.createTimeLog({
          id: row.deterministicId,
          uid,
          isDemo,
          description: row.description,
          projectId,
          tagIds,
          isBillable: row.isBillable,
          startTimeUTC: row.startTimeUTC,
          endTimeUTC: row.endTimeUTC,
          durationSeconds: row.durationSeconds,
          source: 'import',
        });

        existingIds.add(row.deterministicId);
        existingComposites.add(composite);
        importedLogs += 1;
      }

      publishDomainEvent({
        type: 'CsvImported',
        at: new Date().toISOString(),
        rows: importedLogs,
      });

      return {
        createdProjects,
        createdTags,
        importedLogs,
        skippedDuplicates,
      };
    } finally {
      isCommitting.value = false;
    }
  }

  function exportCsvDownload(logsToExport?: readonly TimeLog[]) {
    const targetLogs = logsToExport ?? timeLogsStore.sortedLogs;
    const csvContent = serializeTogglCsv({
      logs: targetLogs,
      userName: authStore.user?.displayName || 'Klox User',
      userEmail: authStore.user?.email || 'user@klox.dev',
    });

    if (import.meta.client) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `klox-toggl-export-${dateStamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    publishDomainEvent({
      type: 'CsvExported',
      at: new Date().toISOString(),
      rows: targetLogs.length,
    });

    return csvContent;
  }

  return {
    isCommitting,
    buildPreview,
    commitPreview,
    exportCsvDownload,
  };
}
