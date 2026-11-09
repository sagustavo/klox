import { elapsedSeconds } from '~/domain/duration';
import { publishDomainEvent } from '~/domain/events';
import { UNASSIGNED_PROJECT_ID, applyProjectSwitch } from '~/domain/invariants';
import type { ActiveTimer, EntityId, TimeLog } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { useTimeLogsStore } from './timeLogs';

const STORAGE_ACTIVE_TIMER_KEY = 'klox_active_timer';

export const useTimerStore = defineStore('timer', () => {
  const activeTimer = ref<ActiveTimer | null>(null);

  // Draft composer state (synchronized with ActiveTimer when running)
  const description = ref('');
  const projectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);
  const taskId = ref<EntityId | undefined>(undefined);
  const tagIds = ref<EntityId[]>([]);
  const isBillable = ref(false);

  const nowMs = ref(Date.now());
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  const isRunning = computed(() => Boolean(activeTimer.value));

  /**
   * Resilience Invariant (GEMINI.md §2.4):
   * Elapsed seconds are ALWAYS derived as Math.floor((Date.now() - Date.parse(startTimeUTC)) / 1000).
   */
  const currentElapsedSeconds = computed(() => {
    if (!activeTimer.value) return 0;
    return elapsedSeconds(activeTimer.value.startTimeUTC, nowMs.value);
  });

  function startTicker() {
    if (import.meta.server || tickHandle) return;
    nowMs.value = Date.now();
    tickHandle = setInterval(() => {
      nowMs.value = Date.now();
    }, 250);
  }

  function persistLocal(timer: ActiveTimer | null) {
    if (import.meta.server) return;
    try {
      if (timer) {
        localStorage.setItem(STORAGE_ACTIVE_TIMER_KEY, JSON.stringify(timer));
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_TIMER_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  function applyTimerToDraft(timer: ActiveTimer) {
    description.value = timer.description;
    projectId.value = timer.projectId;
    taskId.value = timer.taskId;
    tagIds.value = [...timer.tagIds];
    isBillable.value = timer.isBillable;
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    startTicker();

    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE_TIMER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ActiveTimer;
        if (parsed?.startTimeUTC) {
          activeTimer.value = parsed;
          applyTimerToDraft(parsed);
        }
      }
    } catch {
      // Ignore malformed local storage
    }

    if (isDemo) return;
    const fb = await getFirebaseClient();
    if (!fb) return;

    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'users', uid));
      const remoteTimer = snap.data()?.activeTimer as ActiveTimer | null | undefined;
      if (remoteTimer?.startTimeUTC) {
        activeTimer.value = remoteTimer;
        applyTimerToDraft(remoteTimer);
        persistLocal(remoteTimer);
      }
    } catch (err) {
      console.warn('[Klox timer hydrate fallback to local]', err);
    }
  }

  async function syncActiveTimerRemote(uid: string, isDemo: boolean, timer: ActiveTimer | null) {
    persistLocal(timer);
    if (isDemo) return;
    const fb = await getFirebaseClient();
    if (!fb) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(
        doc(fb.db, 'users', uid),
        {
          activeTimer: timer,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[Klox activeTimer Firestore sync error]', err);
    }
  }

  /**
   * Enforces the Project-Scoped Tag invariant whenever the user switches projects.
   */
  function selectProject(nextProjectId: EntityId) {
    const catalogStore = useCatalogStore();
    const proj = catalogStore.getProjectById(nextProjectId);
    if (!proj) {
      projectId.value = nextProjectId;
      tagIds.value = [];
      return;
    }
    const switched = applyProjectSwitch({
      nextProject: proj,
      currentTagIds: tagIds.value,
      allTags: catalogStore.tags,
    });
    projectId.value = switched.projectId;
    tagIds.value = switched.tagIds;
    isBillable.value = switched.isBillable;
    taskId.value = undefined;
  }

  function toggleTag(tagId: EntityId) {
    if (tagIds.value.includes(tagId)) {
      tagIds.value = tagIds.value.filter((id) => id !== tagId);
    } else {
      tagIds.value = [...tagIds.value, tagId];
    }
  }

  /**
   * Single Active Timer Constraint (GEMINI.md §2.4):
   * Starting a new Timer while one is running automatically stops and commits the running Timer first.
   */
  async function startTimer(params: { uid: string; isDemo: boolean }): Promise<void> {
    if (activeTimer.value) {
      await stopTimer(params);
    }

    const nowIso = new Date().toISOString();
    const nextTimer: ActiveTimer = {
      description: description.value.trim() || 'Untitled task',
      projectId: projectId.value || UNASSIGNED_PROJECT_ID,
      ...(taskId.value ? { taskId: taskId.value } : {}),
      tagIds: [...tagIds.value],
      isBillable: isBillable.value,
      startTimeUTC: nowIso,
    };

    activeTimer.value = nextTimer;
    nowMs.value = Date.now();
    startTicker();

    await syncActiveTimerRemote(params.uid, params.isDemo, nextTimer);
    publishDomainEvent({ type: 'TimerStarted', at: nowIso });
  }

  async function stopTimer(params: { uid: string; isDemo: boolean }): Promise<TimeLog | null> {
    const current = activeTimer.value;
    if (!current) return null;

    const endTimeUTC = new Date().toISOString();
    const duration = elapsedSeconds(current.startTimeUTC, Date.parse(endTimeUTC));

    // Allow live edits made to description/project/tags/billable while running to be committed
    const committedDesc = description.value.trim() || current.description || 'Untitled task';
    const committedProjectId = projectId.value || current.projectId;
    const committedTagIds = [...tagIds.value];
    const committedBillable = isBillable.value;

    activeTimer.value = null;
    await syncActiveTimerRemote(params.uid, params.isDemo, null);

    const timeLogsStore = useTimeLogsStore();
    const created = await timeLogsStore.createTimeLog({
      uid: params.uid,
      isDemo: params.isDemo,
      description: committedDesc,
      projectId: committedProjectId,
      taskId: taskId.value ?? current.taskId,
      tagIds: committedTagIds,
      isBillable: committedBillable,
      startTimeUTC: current.startTimeUTC,
      endTimeUTC,
      durationSeconds: Math.max(1, duration),
      source: 'timer',
    });

    publishDomainEvent({ type: 'TimerStopped', at: endTimeUTC });

    // Reset draft description for the next task while keeping current project context
    description.value = '';
    return created;
  }

  return {
    activeTimer,
    description,
    projectId,
    taskId,
    tagIds,
    isBillable,
    isRunning,
    currentElapsedSeconds,
    hydrate,
    selectProject,
    toggleTag,
    startTimer,
    stopTimer,
  };
});
