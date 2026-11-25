import { publishDomainEvent } from '~/domain/events';
import { UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import { triggerCsvBlobDownload, useTogglCsv } from '~/composables/useTogglCsv';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

export type WorkspaceWipeStage =
  | 'idle'
  | 'hydrating'
  | 'backing_up'
  | 'deleting'
  | 'done'
  | 'error';

export interface WorkspaceWipeResult {
  deletedProjects: number;
  deletedTags: number;
  deletedTasks: number;
  deletedLogs: number;
  clearedActiveTimer: boolean;
}

export function useWorkspaceWipe() {
  const authStore = useAuthStore();
  const catalogStore = useCatalogStore();
  const timeLogsStore = useTimeLogsStore();
  const timerStore = useTimerStore();
  const { exportFullBackupCsvDownload } = useTogglCsv();

  const stage = ref<WorkspaceWipeStage>('idle');
  const errorMessage = ref<string | null>(null);
  const lastBackup = ref<{ csvContent: string; filename: string } | null>(null);
  const lastResult = ref<WorkspaceWipeResult | null>(null);

  const isWiping = computed(
    () =>
      stage.value === 'hydrating' ||
      stage.value === 'backing_up' ||
      stage.value === 'deleting'
  );

  async function executeBackupAndWipe(): Promise<{ ok: boolean }> {
    const user = authStore.user;
    if (!user) {
      stage.value = 'error';
      errorMessage.value = 'AUTH_REQUIRED';
      return { ok: false };
    }

    const uid = user.uid;
    const isDemo = authStore.isDemoMode;
    errorMessage.value = null;

    try {
      // 1. Authoritative full fetch so Stage 2 streaming can never omit older entries
      stage.value = 'hydrating';
      let backupProjects = catalogStore.projects;
      let backupTags = catalogStore.tags;
      let backupTasks = catalogStore.tasks;
      let backupLogs = timeLogsStore.sortedLogs;

      if (!isDemo) {
        const [remoteCatalog, remoteLogs] = await Promise.all([
          catalogStore.fetchAllRemoteCatalog(uid),
          timeLogsStore.fetchAllRemoteLogs(uid),
        ]);
        backupProjects = remoteCatalog.projects;
        backupTags = remoteCatalog.tags;
        backupTasks = remoteCatalog.tasks;
        backupLogs = remoteLogs;
      } else {
        await Promise.all([
          catalogStore.hydrate(uid, true),
          timeLogsStore.hydrate(uid, true),
          timerStore.hydrate(uid, true),
        ]);
        backupProjects = catalogStore.projects;
        backupTags = catalogStore.tags;
        backupTasks = catalogStore.tasks;
        backupLogs = timeLogsStore.sortedLogs;
      }

      // 2. Mandatory backup CSV generation & download BEFORE any deletion
      stage.value = 'backing_up';
      const backup = exportFullBackupCsvDownload({
        logs: backupLogs,
        projects: backupProjects,
        tags: backupTags,
        tasks: backupTasks,
      });
      if (!backup.csvContent) {
        throw new Error('BACKUP_EMPTY');
      }
      lastBackup.value = backup;

      // Give the browser download manager a tick to initiate cleanly
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 3. Delete active timer + all logs + all catalog data (keeping General / Unassigned)
      stage.value = 'deleting';
      const hadActiveTimer = timerStore.isRunning;
      if (hadActiveTimer) {
        await timerStore.discardTimer({ uid, isDemo });
      } else {
        timerStore.description = '';
        timerStore.selectProject(UNASSIGNED_PROJECT_ID);
      }

      const [logRes, catalogRes] = await Promise.all([
        timeLogsStore.wipeAllLogs({ uid, isDemo }),
        catalogStore.wipeAllData({ uid, isDemo }),
      ]);

      lastResult.value = {
        deletedProjects: catalogRes.deletedProjects,
        deletedTags: catalogRes.deletedTags,
        deletedTasks: catalogRes.deletedTasks,
        deletedLogs: logRes.deletedLogs,
        clearedActiveTimer: hadActiveTimer,
      };
      stage.value = 'done';

      publishDomainEvent({
        type: 'WorkspaceWiped',
        at: new Date().toISOString(),
      });

      return { ok: true };
    } catch (err) {
      console.error('[Klox executeBackupAndWipe error]', err);
      stage.value = 'error';
      errorMessage.value = err instanceof Error ? err.message : 'WIPE_FAILED';
      return { ok: false };
    }
  }

  function redownloadLastBackup(): void {
    if (!lastBackup.value) return;
    triggerCsvBlobDownload(lastBackup.value.csvContent, lastBackup.value.filename);
  }

  function resetStatus(): void {
    if (isWiping.value) return;
    stage.value = 'idle';
    errorMessage.value = null;
  }

  return {
    stage,
    isWiping,
    errorMessage,
    lastBackup,
    lastResult,
    executeBackupAndWipe,
    redownloadLastBackup,
    resetStatus,
  };
}
