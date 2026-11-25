import { publishDomainEvent } from '~/domain/events';
import { UNASSIGNED_PROJECT_ID, formatTaskHierarchyLabel } from '~/domain/invariants';
import {
  buildTogglCompositeKey,
  parseAndPreviewTogglCsv,
  refreshTogglPreviewStatuses,
  serializeTogglCsv,
  type TogglDryRunPreview,
} from '~/domain/toggl';
import type { EntityId, Project, ProjectTag, Task, TimeLog } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimeLogsStore } from '~/stores/timeLogs';

export function triggerCsvBlobDownload(csvContent: string, filename: string): void {
  if (!import.meta.client) return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function useTogglCsv() {
  const authStore = useAuthStore();
  const catalogStore = useCatalogStore();
  const timeLogsStore = useTimeLogsStore();

  const isParsing = ref(false);
  const parseProgress = ref<{ processed: number; total: number } | null>(null);
  const isCommitting = ref(false);
  const importProgress = ref<{ completed: number; total: number } | null>(null);

  async function buildPreview(csvText: string): Promise<TogglDryRunPreview> {
    isParsing.value = true;
    parseProgress.value = null;
    try {
      return await parseAndPreviewTogglCsv({
        csvText,
        existingProjects: catalogStore.projects,
        existingTags: catalogStore.tags,
        existingTasks: catalogStore.tasks,
        existingLogs: timeLogsStore.logs,
        onProgress: (processed, total) => {
          parseProgress.value = { processed, total };
        },
      });
    } finally {
      isParsing.value = false;
      parseProgress.value = null;
    }
  }

  function refreshPreview(preview: TogglDryRunPreview): TogglDryRunPreview {
    return refreshTogglPreviewStatuses({
      preview,
      existingProjects: catalogStore.projects,
      existingTags: catalogStore.tags,
      existingTasks: catalogStore.tasks,
      existingLogs: timeLogsStore.logs,
    });
  }

  async function commitPreview(preview: TogglDryRunPreview): Promise<{
    createdProjects: number;
    createdTags: number;
    createdTasks: number;
    importedLogs: number;
    skippedDuplicates: number;
  }> {
    const uid = authStore.user?.uid ?? 'demo-user';
    const isDemo = authStore.isDemoMode;

    isCommitting.value = true;
    importProgress.value = { completed: 0, total: preview.newLogsCount };

    try {
      let skippedDuplicates = 0;

      // 1. Ensure all missing projects exist in a single batch
      const projectByLower = new Map<string, Project>();
      for (const p of catalogStore.projects) {
        projectByLower.set(p.name.trim().toLowerCase(), p);
      }

      const missingProjNames = preview.newProjectNames.filter(
        (name) => !projectByLower.has(name.trim().toLowerCase())
      );

      const createdProjList = await catalogStore.createProjectsBatch({
        uid,
        isDemo,
        items: missingProjNames.map((name) => ({ name, isBillableDefault: false })),
      });

      for (const created of createdProjList) {
        projectByLower.set(created.name.trim().toLowerCase(), created);
      }
      const createdProjects = createdProjList.length;

      const resolveProjectId = (rawName: string): EntityId => {
        const trimmed = rawName.trim();
        if (!trimmed || trimmed.toLowerCase() === 'general / unassigned') {
          return UNASSIGNED_PROJECT_ID;
        }
        return projectByLower.get(trimmed.toLowerCase())?.id ?? UNASSIGNED_PROJECT_ID;
      };

      // 2. Ensure all missing project-scoped tags exist in a single batch
      const tagByProjAndLower = new Map<string, ProjectTag>();
      for (const t of catalogStore.tags) {
        tagByProjAndLower.set(`${t.projectId}::${t.name.trim().toLowerCase()}`, t);
      }

      const missingScopedTags = preview.newScopedTags.filter((st) => {
        const projectId = resolveProjectId(st.projectName);
        return !tagByProjAndLower.has(`${projectId}::${st.tagName.trim().toLowerCase()}`);
      });

      const createdTagList = await catalogStore.createTagsBatch({
        uid,
        isDemo,
        items: missingScopedTags.map((st) => ({
          projectId: resolveProjectId(st.projectName),
          name: st.tagName,
        })),
      });

      for (const created of createdTagList) {
        tagByProjAndLower.set(
          `${created.projectId}::${created.name.trim().toLowerCase()}`,
          created
        );
      }
      const createdTags = createdTagList.length;

      // 2.5. Ensure all missing hierarchical tasks exist in a single batch
      const createdTaskList = await catalogStore.createTasksBatch({
        uid,
        isDemo,
        items: preview.newTasks.map((nt) => ({
          projectId: resolveProjectId(nt.projectName),
          taskPath: nt.taskPath,
        })),
      });
      const createdTasks = createdTaskList.length;

      const taskIdByProjAndPathLower = new Map<string, EntityId>();
      for (const task of catalogStore.tasks) {
        const labelLower = formatTaskHierarchyLabel(task, catalogStore.tasks).trim().toLowerCase();
        if (labelLower) {
          taskIdByProjAndPathLower.set(`${task.projectId}::${labelLower}`, task.id);
        }
      }

      // 3. Filter non-duplicate TimeLog rows and batch-commit via writeBatch (450/chunk, parallel)
      const existingIds = new Set(timeLogsStore.logs.map((l) => l.id));
      const existingComposites = new Set(
        timeLogsStore.logs.map((l) =>
          buildTogglCompositeKey({
            startTimeUTC: l.startTime,
            durationSeconds: l.durationSeconds,
            normalizedDescription: l.normalizedDescription,
            projectName: l.projectNameSnapshot,
          })
        )
      );

      const batchItems: Array<{
        id: EntityId;
        description: string;
        projectId: EntityId;
        taskId?: EntityId;
        tagIds: EntityId[];
        isBillable: boolean;
        startTimeUTC: string;
        endTimeUTC: string;
        durationSeconds: number;
      }> = [];

      for (const row of preview.logRows) {
        const composite = buildTogglCompositeKey({
          startTimeUTC: row.startTimeUTC,
          durationSeconds: row.durationSeconds,
          normalizedDescription: row.normalizedDescription,
          projectName: row.projectName,
        });
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

        const resolvedTaskId = row.taskName.trim()
          ? taskIdByProjAndPathLower.get(`${projectId}::${row.taskName.trim().toLowerCase()}`)
          : undefined;

        batchItems.push({
          id: row.deterministicId,
          description: row.description,
          projectId,
          ...(resolvedTaskId ? { taskId: resolvedTaskId } : {}),
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
        createdTasks,
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
      projects: catalogStore.projects,
      tasks: catalogStore.tasks,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerCsvBlobDownload(csvContent, `klox-toggl-export-${dateStamp}.csv`);

    publishDomainEvent({
      type: 'CsvExported',
      at: new Date().toISOString(),
      rows: targetLogs.length,
    });

    return csvContent;
  }

  function exportFullBackupCsvDownload(params?: {
    logs?: readonly TimeLog[];
    projects?: readonly Project[];
    tags?: readonly ProjectTag[];
    tasks?: readonly Task[];
  }): { csvContent: string; filename: string } {
    const targetLogs = params?.logs ?? timeLogsStore.sortedLogs;
    const targetProjects = params?.projects ?? catalogStore.projects;
    const targetTags = params?.tags ?? catalogStore.tags;
    const targetTasks = params?.tasks ?? catalogStore.tasks;

    const csvContent = serializeTogglCsv({
      logs: targetLogs,
      userName: authStore.user?.displayName || 'Klox User',
      userEmail: authStore.user?.email || 'user@klox.dev',
      tags: targetTags,
      projects: targetProjects,
      tasks: targetTasks,
      includeCatalogMetadata: true,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `klox-backup-${stamp}.csv`;
    triggerCsvBlobDownload(csvContent, filename);

    publishDomainEvent({
      type: 'CsvExported',
      at: new Date().toISOString(),
      rows: targetLogs.length,
    });

    return { csvContent, filename };
  }

  return {
    isParsing,
    parseProgress,
    isCommitting,
    importProgress,
    buildPreview,
    refreshPreview,
    commitPreview,
    exportCsvDownload,
    exportFullBackupCsvDownload,
  };
}
