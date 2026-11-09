import { elapsedSeconds, normalizeDescription, toDateKey } from '~/domain/duration';
import { publishDomainEvent, type TimeLogSource } from '~/domain/events';
import { generateRandomId } from '~/domain/ids';
import { UNASSIGNED_PROJECT_ID, tagsForProject } from '~/domain/invariants';
import type { EntityId, TimeLog } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { usePreferencesStore } from './preferences';

const STORAGE_LOGS_KEY = 'klox_time_logs';

export const useTimeLogsStore = defineStore('timeLogs', () => {
  const logs = ref<TimeLog[]>([]);
  const loadedUid = ref<string | null>(null);
  const loading = ref(false);

  const sortedLogs = computed(() =>
    [...logs.value].sort((a, b) => b.startTime.localeCompare(a.startTime))
  );

  function persistLocal() {
    if (import.meta.server) return;
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs.value));
    } catch {
      // Ignore quota errors
    }
  }

  function loadLocal() {
    if (import.meta.server) return;
    try {
      const raw = localStorage.getItem(STORAGE_LOGS_KEY);
      logs.value = raw ? (JSON.parse(raw) as TimeLog[]) : [];
    } catch {
      logs.value = [];
    }
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    if (loadedUid.value === uid && logs.value.length > 0) return;

    loading.value = true;
    try {
      loadLocal();
      loadedUid.value = uid;

      if (isDemo) return;
      const fb = await getFirebaseClient();
      if (!fb) return;

      const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
      const q = query(
        collection(fb.db, 'users', uid, 'timeLogs'),
        orderBy('startTime', 'desc')
      );
      const snap = await getDocs(q);
      logs.value = snap.docs.map((d) => d.data() as TimeLog);
      persistLocal();
    } catch (err) {
      console.warn('[Klox timeLogs hydrate fallback to local]', err);
    } finally {
      loading.value = false;
    }
  }

  function buildTimeLogEntity(params: {
    id?: EntityId;
    uid: string;
    description: string;
    projectId: EntityId;
    taskId?: EntityId;
    tagIds: readonly EntityId[];
    isBillable: boolean;
    startTimeUTC: string;
    endTimeUTC: string;
    durationSeconds?: number;
  }): TimeLog {
    const catalogStore = useCatalogStore();
    const prefsStore = usePreferencesStore();

    const project =
      catalogStore.getProjectById(params.projectId) ??
      catalogStore.getProjectById(UNASSIGNED_PROJECT_ID);

    const resolvedProjectId = project?.id ?? UNASSIGNED_PROJECT_ID;
    const validScopedTags = tagsForProject(catalogStore.tags, resolvedProjectId);
    const validTagMap = new Map(validScopedTags.map((t) => [t.id, t.name]));

    const cleanTagIds = params.tagIds.filter((id) => validTagMap.has(id));
    const tagNamesSnapshot = cleanTagIds.map((id) => validTagMap.get(id) ?? '');

    const duration =
      params.durationSeconds !== undefined
        ? Math.max(0, Math.floor(params.durationSeconds))
        : elapsedSeconds(params.startTimeUTC, Date.parse(params.endTimeUTC));

    const tz = prefsStore.preferences.timeZone || 'UTC';
    const desc = params.description.trim() || 'Untitled task';
    const task = params.taskId
      ? catalogStore.tasks.find((t) => t.id === params.taskId && t.projectId === resolvedProjectId)
      : undefined;

    return {
      id: params.id ?? generateRandomId(),
      userId: params.uid,
      description: desc,
      normalizedDescription: normalizeDescription(desc),
      projectId: resolvedProjectId,
      projectNameSnapshot: project?.name ?? 'General / Unassigned',
      projectColorSnapshot: project?.color ?? '#8E8E93',
      ...(task ? { taskId: task.id, taskNameSnapshot: task.name } : {}),
      tagIds: cleanTagIds,
      tagNamesSnapshot,
      isBillable: params.isBillable,
      startTime: params.startTimeUTC,
      endTime: params.endTimeUTC,
      durationSeconds: duration,
      timeZone: tz,
      dateKey: toDateKey(params.startTimeUTC, tz),
    };
  }

  async function createTimeLog(params: {
    id?: EntityId;
    uid: string;
    isDemo: boolean;
    description: string;
    projectId: EntityId;
    taskId?: EntityId;
    tagIds: readonly EntityId[];
    isBillable: boolean;
    startTimeUTC: string;
    endTimeUTC: string;
    durationSeconds?: number;
    source: TimeLogSource;
  }): Promise<TimeLog> {
    const entity = buildTimeLogEntity(params);
    logs.value = [entity, ...logs.value.filter((l) => l.id !== entity.id)];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'timeLogs', entity.id), entity);
      }
    }

    publishDomainEvent({
      type: 'TimeLogCreated',
      at: new Date().toISOString(),
      source: params.source,
    });

    return entity;
  }

  async function updateTimeLog(params: {
    uid: string;
    isDemo: boolean;
    logId: EntityId;
    description: string;
    projectId: EntityId;
    tagIds: readonly EntityId[];
    isBillable: boolean;
    startTimeUTC: string;
    endTimeUTC: string;
    durationSeconds?: number;
  }): Promise<void> {
    const existing = logs.value.find((l) => l.id === params.logId);
    if (!existing) return;

    const updated = buildTimeLogEntity({
      id: existing.id,
      uid: params.uid,
      description: params.description,
      projectId: params.projectId,
      taskId: existing.taskId,
      tagIds: params.tagIds,
      isBillable: params.isBillable,
      startTimeUTC: params.startTimeUTC,
      endTimeUTC: params.endTimeUTC,
      durationSeconds: params.durationSeconds,
    });

    logs.value = logs.value.map((l) => (l.id === updated.id ? updated : l));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'timeLogs', updated.id), updated);
      }
    }
  }

  async function deleteTimeLog(params: {
    uid: string;
    isDemo: boolean;
    logId: EntityId;
  }): Promise<void> {
    logs.value = logs.value.filter((l) => l.id !== params.logId);
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(fb.db, 'users', params.uid, 'timeLogs', params.logId));
      }
    }
  }

  return {
    logs,
    sortedLogs,
    loading,
    hydrate,
    buildTimeLogEntity,
    createTimeLog,
    updateTimeLog,
    deleteTimeLog,
    persistLocal,
  };
});
