import { elapsedSeconds } from '~/domain/duration';
import { tenantStorageKey } from '~/domain/auth';
import { publishDomainEvent } from '~/domain/events';
import { UNASSIGNED_PROJECT_ID, applyProjectSwitch } from '~/domain/invariants';
import type { ActiveTimer, EntityId, TimeLog } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { useTimeLogsStore } from './timeLogs';

const STORAGE_ACTIVE_TIMER_KEY = 'klox_active_timer';

export const useTimerStore = defineStore('timer', () => {
  const activeTimer = ref<ActiveTimer | null>(null);
  const activeUid = ref<string | null>(null);

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
    if (import.meta.server || !activeUid.value) return;
    try {
      const storageKey = tenantStorageKey(STORAGE_ACTIVE_TIMER_KEY, activeUid.value);
      if (timer) {
        localStorage.setItem(storageKey, JSON.stringify(timer));
      } else {
        localStorage.removeItem(storageKey);
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

  function reset() {
    activeTimer.value = null;
    activeUid.value = null;
    description.value = '';
    projectId.value = UNASSIGNED_PROJECT_ID;
    taskId.value = undefined;
    tagIds.value = [];
    isBillable.value = false;
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    startTicker();

    if (activeUid.value !== uid) {
      activeTimer.value = null;
      description.value = '';
      projectId.value = UNASSIGNED_PROJECT_ID;
      taskId.value = undefined;
      tagIds.value = [];
      isBillable.value = false;
      activeUid.value = uid;
    }

    try {
      let raw = localStorage.getItem(tenantStorageKey(STORAGE_ACTIVE_TIMER_KEY, uid));
      if (raw === null && uid === 'demo-user') {
        raw = localStorage.getItem(STORAGE_ACTIVE_TIMER_KEY);
      }
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
      } else if (snap.exists() && !remoteTimer) {
        activeTimer.value = null;
        persistLocal(null);
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

  function selectTask(nextTaskId: EntityId | undefined) {
    const catalogStore = useCatalogStore();
    if (!nextTaskId) {
      taskId.value = undefined;
      return;
    }
    const task = catalogStore.getTaskById(nextTaskId);
    if (!task) {
      taskId.value = undefined;
      return;
    }
    if (task.projectId !== projectId.value) {
      selectProject(task.projectId);
    }
    taskId.value = task.id;
    if (!description.value.trim()) {
      description.value = catalogStore.getTaskHierarchicalLabel(task.id) || task.name;
    }
  }

  /**
   * Direct Task-to-Timer Execution (FR-4.3 / ADR-0007):
   * Starts a live ActiveTimer directly from any Task, Subtask, or Sub-subtask,
   * stopping any running timer first and transitioning 'todo' -> 'in_progress'.
   */
  async function startTimerFromTask(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
  }): Promise<void> {
    const catalogStore = useCatalogStore();
    const task = catalogStore.getTaskById(params.taskId);
    if (!task) return;

    if (activeTimer.value) {
      await stopTimer({ uid: params.uid, isDemo: params.isDemo });
    }

    selectProject(task.projectId);
    taskId.value = task.id;
    description.value = catalogStore.getTaskHierarchicalLabel(task.id) || task.name;

    await startTimer({ uid: params.uid, isDemo: params.isDemo });

    if (task.status === 'todo') {
      await catalogStore.updateTaskStatus({
        uid: params.uid,
        isDemo: params.isDemo,
        taskId: task.id,
        status: 'in_progress',
      });
    }
  }

  /**
   * 1-Click Continue Activity from a historical TimeLog (or grouped summary row):
   * Stops and commits any running ActiveTimer first, applies the log's description,
   * project, task, valid project-scoped tags, and billable flag, and starts a new timer.
   */
  async function continueFromLog(params: {
    uid: string;
    isDemo: boolean;
    log: Pick<TimeLog, 'description' | 'projectId' | 'taskId' | 'tagIds' | 'isBillable'>;
  }): Promise<void> {
    const catalogStore = useCatalogStore();

    if (activeTimer.value) {
      await stopTimer({ uid: params.uid, isDemo: params.isDemo });
    }

    const targetProject =
      catalogStore.getProjectById(params.log.projectId) ??
      catalogStore.getProjectById(UNASSIGNED_PROJECT_ID);
    const resolvedProjectId = targetProject?.id ?? UNASSIGNED_PROJECT_ID;

    const validTagSet = new Set(
      catalogStore.getTagsForProject(resolvedProjectId).map((tag) => tag.id)
    );
    const validTagIds = params.log.tagIds.filter((id) => validTagSet.has(id));

    const linkedTask = params.log.taskId
      ? catalogStore.getTaskById(params.log.taskId)
      : undefined;
    const validTask =
      linkedTask && linkedTask.projectId === resolvedProjectId ? linkedTask : undefined;

    description.value = params.log.description.trim() || 'Untitled task';
    projectId.value = resolvedProjectId;
    taskId.value = validTask?.id;
    tagIds.value = validTagIds;
    isBillable.value = params.log.isBillable;

    await startTimer({ uid: params.uid, isDemo: params.isDemo });

    if (validTask && validTask.status === 'todo') {
      await catalogStore.updateTaskStatus({
        uid: params.uid,
        isDemo: params.isDemo,
        taskId: validTask.id,
        status: 'in_progress',
      });
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

  /**
   * Adjusts/backdates `startTimeUTC` on a live running `ActiveTimer` (FR-5.2),
   * immediately recalculating `currentElapsedSeconds` and persisting to localStorage + Firestore.
   */
  async function updateActiveTimerStart(params: {
    uid: string;
    isDemo: boolean;
    startTimeUTC: string;
  }): Promise<boolean> {
    const current = activeTimer.value;
    if (!current) return false;

    const parsedMs = Date.parse(params.startTimeUTC);
    if (Number.isNaN(parsedMs)) return false;

    const now = Date.now();
    const clampedIso = new Date(Math.min(parsedMs, now)).toISOString();

    const updatedTimer: ActiveTimer = {
      ...current,
      startTimeUTC: clampedIso,
    };

    activeTimer.value = updatedTimer;
    nowMs.value = now;
    startTicker();

    await syncActiveTimerRemote(params.uid, params.isDemo, updatedTimer);
    return true;
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
    reset,
    selectProject,
    selectTask,
    toggleTag,
    startTimer,
    startTimerFromTask,
    continueFromLog,
    stopTimer,
    updateActiveTimerStart,
  };
});
