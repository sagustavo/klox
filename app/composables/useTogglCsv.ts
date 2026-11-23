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
  const importProgress = ref<{ completed: number; total: number } | null>(null);

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
    importProgress.value = { completed: 0, total: preview.newLogsCount };

    try {
      let createdProjects = 0;
      let createdTags = 0;
      let skippedDuplicates = 0;

      // 1. Ensure all projects exist (in parallel if multiple new projects)
      const projectByLower = new Map<string, Project>();
      for (const p of catalogStore.projects) {
        projectByLower.set(p.name.trim().toLowerCase(), p);
      }

      const missingProjNames = preview.newProjectNames.filter(
        (name) => !projectByLower.has(name.trim().toLowerCase())
      );

      const createdProjList = await Promise.all(
        missingProjNames.map((projName) =>
          catalogStore.createProject({
            uid,
            isDemo,
            name: projName,
            isBillableDefault: false,
          })
        )
      );

      for (const created of createdProjList) {
        projectByLower.set(created.name.trim().toLowerCase(), created);
        createdProjects += 1;
      }

      const resolveProjectId = (rawName: string): EntityId => {
        const trimmed = rawName.trim();
        if (!trimmed || trimmed.toLowerCase() === 'general / unassigned') {
          return UNASSIGNED_PROJECT_ID;
        }
        return projectByLower.get(trimmed.toLowerCase())?.id ?? UNASSIGNED_PROJECT_ID;
      };

      // 2. Ensure all project-scoped tags exist (in parallel)
      const tagByProjAndLower = new Map<string, ProjectTag>();
      for (const t of catalogStore.tags) {
        tagByProjAndLower.set(`${t.projectId}::${t.name.trim().toLowerCase()}`, t);
      }

      const missingScopedTags = preview.newScopedTags.filter((st) => {
        const projectId = resolveProjectId(st.projectName);
        return !tagByProjAndLower.has(`${projectId}::${st.tagName.trim().toLowerCase()}`);
      });

      const createdTagList = await Promise.all(
        missingScopedTags.map((st) =>
          catalogStore.createTag({
            uid,
            isDemo,
            projectId: resolveProjectId(st.projectName),
            name: st.tagName,
          })
        )
      );

      for (const created of createdTagList) {
        tagByProjAndLower.set(
          `${created.projectId}::${created.name.trim().toLowerCase()}`,
          created
        );
        createdTags += 1;
      }

      // 3. Filter non-duplicate TimeLog rows and batch-commit via writeBatch (450/chunk, parallel)
      const existingIds = new Set(timeLogsStore.logs.map((l) => l.id));
      const existingComposites = new Set(
        timeLogsStore.logs.map(
          (l) =>
            `${l.startTime}|${l.durationSeconds}|${l.normalizedDescription}|${l.projectNameSnapshot.trim().toLowerCase()}`
        )
      );

      const batchItems: Array<{
        id: EntityId;
        description: string;
        projectId: EntityId;
        tagIds: EntityId[];
        isBillable: boolean;
        startTimeUTC: string;
        endTimeUTC: string;
        durationSeconds: number;
      }> = [];

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

        batchItems.push({
          id: row.deterministicId,
          description: row.description,
          projectId,
          tagIds,
          isBillable: row.isBillable,
          startTimeUTC: row.startTimeUTC,
          endTimeUTC: row.endTimeUTC,
          durationSeconds: row.durationSeconds,
        });

        existingIds.add(row.deterministicId);
        existingComposites.add(composite);
      }

      importProgress.value = { completed: 0, total: batchItems.length };

      await timeLogsStore.createTimeLogsBatch({
        uid,
        isDemo,
        items: batchItems,
        source: 'import',
        onProgress: (completed, total) => {
          importProgress.value = { completed, total };
        },
      });

      const importedLogs = batchItems.length;

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
      importProgress.value = null;
    }
  }

  function exportCsvDownload(logsToExport?: readonly TimeLog[]) {
    const targetLogs = logsToExport ?? timeLogsStore.sortedLogs;
    const csvContent = serializeTogglCsv({
      logs: targetLogs,
      userName: authStore.user?.displayName || 'Klox User',
      userEmail: authStore.user?.email || 'user@klox.dev',
      tags: catalogStore.tags,
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
    importProgress,
    buildPreview,
    commitPreview,
    exportCsvDownload,
  };
}
