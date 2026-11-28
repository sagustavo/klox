<script setup lang="ts">
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-vue-next';
import type { AdoSelectedWorkItem } from '~/components/ado/AdoWorkItemPickerPopover.vue';
import type { FilterMultiSelectOption } from '~/components/ui/FilterMultiSelect.vue';
import {
  buildAdoSyncCandidates,
  parseWorkItemIdInput,
  resolveEffectiveProjectAdoTarget,
  type AdoErrorCode,
} from '~/domain/ado';
import { toDateKey } from '~/domain/duration';
import {
  TASK_PAGE_SIZE_OPTIONS,
  UNASSIGNED_PROJECT_ID,
  collectBulkDeleteTaskIds,
  collectDescendantTaskIds,
  compareTasksByPriority,
  computeTaskSelectionTransition,
  filterTaskTree,
  flattenVisibleTaskTree,
  isTaskBranchFullyDone,
  paginateTaskRoots,
  tasksToCsv,
  tasksToMarkdownTable,
  type TaskLinkFilter,
  type TaskSelectionAction,
  type TaskSelectionState,
  type TaskTreeNode,
} from '~/domain/invariants';
import type { EntityId, Project, Task, TaskStatus } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const PAGE_SIZE_STORAGE_KEY = 'klox_tasks_page_size';
const UNTAGGED_FILTER_VALUE = '__untagged__';

const { t } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const timeLogsStore = useTimeLogsStore();
const timerStore = useTimerStore();
const adoStore = useAdoStore();

const selectedProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);

// Google-Tasks style bordered/toggled inline composer (#14)
const quickComposerOpen = ref(false);
const quickTaskTitle = ref('');
const quickTaskInputRef = ref<HTMLInputElement | null>(null);
const suppressQuickBlur = ref(false);
let isQuickCommitting = false;

// Tree-aware filter & search state (#12)
const searchQuery = ref('');
const selectedFilterTagIds = ref<string[]>([]);
const selectedLinkFilter = ref<TaskLinkFilter>('all');

// Expand/Collapse & Completed Section state (#1, #13)
const manualCollapsedIds = ref<Set<EntityId>>(new Set());
const completedExpanded = ref(false);

// Dynamic pagination state (#11)
const pageIndex = ref(0);
const pageSize = ref<number>(10);

// Controlled Inline Title Rename & Subtask Composer state (#6, #8)
const editingTaskId = ref<EntityId | null>(null);
const addingSubtaskForId = ref<EntityId | null>(null);

// Internal clipboard for Copy/Paste (⌘C / ⌘V) (#9)
const clipboardTaskIds = ref<EntityId[]>([]);

// Sprint selector & confirmation import modal state
const selectedIterationPath = ref('');
const loadingIterations = ref(false);
const sprintError = ref<AdoErrorCode | null>(null);
const sprintStatusText = ref<string | null>(null);
const sprintImportOpen = ref(false);
let sprintStatusTimer: ReturnType<typeof setTimeout> | null = null;

// Multi-selection state (Azure DevOps Backlog style)
const selectionState = ref<TaskSelectionState>({
  selectedIds: [],
  anchorId: null,
  focusedId: null,
});

// Dedicated Task / Work Item Card Modal state
const detailModalOpen = ref(false);
const detailModalTaskId = ref<EntityId | null>(null);

// Other Modals & Confirmation state
const syncReviewOpen = ref(false);
const createAdoDialogOpen = ref(false);
const createAdoTargetTask = ref<Task | null>(null);
const refreshingAdo = ref(false);

const pendingDelete = ref<
  | {
      kind: 'single';
      taskId: EntityId;
      name: string;
      descendantCount: number;
    }
  | {
      kind: 'bulk';
      taskIds: EntityId[];
      selectedCount: number;
      totalDeleteCount: number;
    }
  | null
>(null);
const isDeleting = ref(false);

const isInitialLoading = computed(
  () =>
    !authStore.user ||
    catalogStore.loading ||
    catalogStore.loadedUid !== authStore.user.uid
);

const selectedProject = computed(() =>
  catalogStore.getProjectById(selectedProjectId.value)
);

const projectTags = computed(() =>
  catalogStore.getTagsForProject(selectedProjectId.value)
);

const projectConnection = computed(() =>
  adoStore.getConnectionForProject(selectedProjectId.value)
);

const effectiveAdoTarget = computed(() =>
  resolveEffectiveProjectAdoTarget(selectedProject.value, adoStore.connections)
);

const projectIterations = computed(() => {
  const connId = projectConnection.value?.id;
  if (!connId) return [];
  return adoStore.iterationsByConn[connId] ?? [];
});

const todayDateKey = computed(() =>
  toDateKey(new Date(), prefsStore.preferences.timeZone || 'UTC')
);

const tagFilterOptions = computed<FilterMultiSelectOption[]>(() => [
  {
    value: UNTAGGED_FILTER_VALUE,
    label: t('tasks.filters.untaggedOnly'),
  },
  ...projectTags.value.map((tag) => ({
    value: tag.id,
    label: tag.name,
    color: selectedProject.value?.color ?? '#3B82F6',
  })),
]);

const includeUntaggedFilter = computed(() =>
  selectedFilterTagIds.value.includes(UNTAGGED_FILTER_VALUE)
);

const activeTagFilterIds = computed(() =>
  selectedFilterTagIds.value.filter((id) => id !== UNTAGGED_FILTER_VALUE)
);

const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim().length > 0 ||
    selectedFilterTagIds.value.length > 0 ||
    selectedLinkFilter.value !== 'all'
);

async function loadIterationsForConnection(connectionId: string) {
  loadingIterations.value = true;
  sprintError.value = null;
  try {
    const res = await adoStore.fetchIterations({
      isDemo: authStore.isDemoMode,
      connectionId,
      timeZone: prefsStore.preferences.timeZone,
    });
    if (res.errorCode) {
      sprintError.value = res.errorCode;
    }
    selectedIterationPath.value =
      res.currentIterationPath ||
      res.iterations[res.iterations.length - 1]?.iterationPath ||
      '';
  } finally {
    loadingIterations.value = false;
  }
}

watch(
  () => projectConnection.value?.id,
  (connId) => {
    sprintStatusText.value = null;
    sprintError.value = null;
    if (connId) {
      void loadIterationsForConnection(connId);
    } else {
      selectedIterationPath.value = '';
    }
  }
);

watch(selectedProjectId, () => {
  selectionState.value = { selectedIds: [], anchorId: null, focusedId: null };
  quickTaskTitle.value = '';
  quickComposerOpen.value = false;
  editingTaskId.value = null;
  addingSubtaskForId.value = null;
  selectedFilterTagIds.value = [];
  selectedLinkFilter.value = 'all';
  searchQuery.value = '';
  pageIndex.value = 0;
});

watch([searchQuery, selectedFilterTagIds, selectedLinkFilter], () => {
  pageIndex.value = 0;
});

function readStoredPageSize(): number {
  if (import.meta.server) return 10;
  try {
    const raw = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    if ((TASK_PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage read errors
  }
  return 10;
}

function handleUpdatePageSize(nextSize: number) {
  pageSize.value = nextSize;
  pageIndex.value = 0;
  if (!import.meta.server) {
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextSize));
    } catch {
      // Ignore storage write errors
    }
  }
}

function clearAllFilters() {
  searchQuery.value = '';
  selectedFilterTagIds.value = [];
  selectedLinkFilter.value = 'all';
  pageIndex.value = 0;
}

function isAnyModalOpen(): boolean {
  return Boolean(
    detailModalOpen.value ||
      sprintImportOpen.value ||
      createAdoDialogOpen.value ||
      syncReviewOpen.value ||
      pendingDelete.value
  );
}

function onWindowKeydown(event: KeyboardEvent) {
  if (isAnyModalOpen()) return;
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [data-reka-popper-content-wrapper]'
    )
  ) {
    return;
  }

  // Open Google-Tasks inline composer (`a` or `c` without modifiers)
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'c')
  ) {
    event.preventDefault();
    openQuickComposer();
    return;
  }

  if (event.altKey) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (orderedTaskIds.value.length === 0) return;
    event.preventDefault();
    dispatchSelection(
      {
        type: 'arrow',
        direction: event.key === 'ArrowDown' ? 'down' : 'up',
        extendRange: event.shiftKey,
      },
      true
    );
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    if (orderedTaskIds.value.length === 0) return;
    event.preventDefault();
    dispatchSelection({ type: 'selectAll' });
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
    const focusId = effectiveFocusedTaskId.value;
    if (!focusId) return;
    event.preventDefault();
    dispatchSelection({ type: 'toggle', taskId: focusId });
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    const targetId = effectiveFocusedTaskId.value ?? selectionState.value.selectedIds[0];
    if (!targetId) return;
    event.preventDefault();
    void handleDuplicateTasks(targetId);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    const textSelection = window.getSelection?.()?.toString().trim() ?? '';
    if (textSelection) return;
    const focusOrSelected =
      selectionState.value.selectedIds.length > 0
        ? [...selectionState.value.selectedIds]
        : effectiveFocusedTaskId.value
          ? [effectiveFocusedTaskId.value]
          : [];
    if (focusOrSelected.length === 0) return;
    event.preventDefault();
    clipboardTaskIds.value = focusOrSelected;
    showActionStatus(t('tasks.toast.copiedToPaste', { count: focusOrSelected.length }));
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    if (clipboardTaskIds.value.length === 0) return;
    event.preventDefault();
    void handlePasteClipboardTasks();
    return;
  }

  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === 'F2' || event.key === 'e')
  ) {
    const targetId =
      selectionState.value.selectedIds.length === 1
        ? selectionState.value.selectedIds[0]!
        : effectiveFocusedTaskId.value;
    if (targetId) {
      event.preventDefault();
      editingTaskId.value = targetId;
    }
    return;
  }

  if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const targetId = effectiveFocusedTaskId.value ?? selectionState.value.selectedIds[0];
    const targetTask = targetId ? catalogStore.getTaskById(targetId) : undefined;
    if (targetTask && (targetTask.depth ?? 0) < 2) {
      event.preventDefault();
      openSubtaskComposer(targetTask.id);
    }
    return;
  }

  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    target?.matches('[data-task-focus-id]')
  ) {
    const focusId = target.getAttribute('data-task-focus-id');
    if (focusId) {
      event.preventDefault();
      openTaskDetailModal(focusId);
    }
    return;
  }

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    selectionState.value.selectedIds.length > 0
  ) {
    event.preventDefault();
    requestBulkDeleteSelected();
    return;
  }

  if (event.key === 'Escape') {
    if (addingSubtaskForId.value) {
      event.preventDefault();
      addingSubtaskForId.value = null;
      return;
    }
    if (editingTaskId.value) {
      event.preventDefault();
      editingTaskId.value = null;
      return;
    }
    if (quickComposerOpen.value) {
      event.preventDefault();
      quickTaskTitle.value = '';
      quickComposerOpen.value = false;
      return;
    }
    if (selectionState.value.selectedIds.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      dispatchSelection({ type: 'clear' });
    }
  }
}

onMounted(async () => {
  pageSize.value = readStoredPageSize();
  if (!import.meta.server) {
    window.addEventListener('keydown', onWindowKeydown);
  }
  if (!authStore.user) return;

  // Background non-blocking hydration for historical time logs so Task board renders swiftly (#5)
  void timeLogsStore.hydrate(authStore.user.uid, authStore.isDemoMode);

  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    prefsStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    adoStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);

  const queryProj =
    typeof route.query.projectId === 'string' ? route.query.projectId.trim() : '';
  const queryMatch = queryProj ? catalogStore.getProjectById(queryProj) : undefined;
  const preferred =
    queryMatch ??
    catalogStore.sortedProjects.find(
      (p) => p.systemKey !== 'unassigned' && adoStore.getConnectionForProject(p.id)
    ) ??
    catalogStore.sortedProjects.find((p) => p.systemKey !== 'unassigned') ??
    catalogStore.sortedProjects[0];

  if (preferred) {
    selectedProjectId.value = preferred.id;
  }
});

onBeforeUnmount(() => {
  if (sprintStatusTimer) clearTimeout(sprintStatusTimer);
  if (!import.meta.server) {
    window.removeEventListener('keydown', onWindowKeydown);
  }
});

const rawProjectTreeRoots = computed(() =>
  catalogStore.getTaskTreeForProject(selectedProjectId.value)
);

const filteredTreeResult = computed(() =>
  filterTaskTree(rawProjectTreeRoots.value, {
    query: searchQuery.value,
    tagIds: activeTagFilterIds.value,
    includeUntagged: includeUntaggedFilter.value,
    linkFilter: selectedLinkFilter.value,
    todayDateKey: todayDateKey.value,
  })
);

const effectiveCollapsedIds = computed<Set<EntityId>>(() => {
  const next = new Set(manualCollapsedIds.value);
  if (hasActiveFilters.value) {
    for (const id of filteredTreeResult.value.autoExpandedIds) {
      next.delete(id);
    }
  }
  return next;
});

const activeRoots = computed<TaskTreeNode[]>(() =>
  filteredTreeResult.value.roots.filter((node) => !isTaskBranchFullyDone(node))
);

const completedRoots = computed<TaskTreeNode[]>(() =>
  filteredTreeResult.value.roots.filter((node) => isTaskBranchFullyDone(node))
);

const activePagination = computed(() =>
  paginateTaskRoots(activeRoots.value, pageIndex.value, pageSize.value)
);

watch(
  () => activePagination.value.pageIndex,
  (clamped) => {
    if (clamped !== pageIndex.value) {
      pageIndex.value = clamped;
    }
  }
);

const expandableParentIds = computed<EntityId[]>(() => {
  const ids: EntityId[] = [];
  const walk = (nodes: readonly TaskTreeNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        ids.push(node.task.id);
        walk(node.children);
      }
    }
  };
  walk(activePagination.value.items);
  if (completedExpanded.value) {
    walk(completedRoots.value);
  }
  return ids;
});

const allExpanded = computed(
  () =>
    expandableParentIds.value.length > 0 &&
    expandableParentIds.value.every((id) => !effectiveCollapsedIds.value.has(id))
);

const visibleNodes = computed<TaskTreeNode[]>(() => [
  ...flattenVisibleTaskTree(activePagination.value.items, effectiveCollapsedIds.value),
  ...(completedExpanded.value
    ? flattenVisibleTaskTree(completedRoots.value, effectiveCollapsedIds.value)
    : []),
]);

const orderedTaskIds = computed(() => visibleNodes.value.map((n) => n.task.id));

const selectedTaskIdSet = computed(() => new Set(selectionState.value.selectedIds));

const effectiveFocusedTaskId = computed(
  () => selectionState.value.focusedId ?? orderedTaskIds.value[0] ?? null
);

// Rolled-up tracked seconds per Task (including descendants)
const trackedSecondsByTask = computed(() => {
  const direct = new Map<EntityId, number>();
  for (const log of timeLogsStore.logs) {
    if (!log.taskId) continue;
    direct.set(log.taskId, (direct.get(log.taskId) ?? 0) + log.durationSeconds);
  }
  const rolledUp = new Map<EntityId, number>();
  for (const task of catalogStore.tasks) {
    const ids = collectDescendantTaskIds(task.id, catalogStore.tasks);
    let sum = 0;
    for (const id of ids) {
      sum += direct.get(id) ?? 0;
    }
    if (sum > 0) rolledUp.set(task.id, sum);
  }
  return rolledUp;
});

const syncCandidates = computed(() =>
  buildAdoSyncCandidates({
    projects: catalogStore.projects,
    tasks: catalogStore.tasks,
    logs: timeLogsStore.logs,
    connections: adoStore.connections,
  })
);

const unsyncedHoursByProject = computed(() => {
  const map = new Map<EntityId, number>();
  for (const item of syncCandidates.value.readyItems) {
    const projId = item.primaryTask.projectId;
    map.set(projId, (map.get(projId) ?? 0) + item.recommendedDeltaHours);
  }
  return map;
});

const unsyncedHoursByTask = computed(() => {
  const map = new Map<EntityId, number>();
  for (const item of syncCandidates.value.readyItems) {
    for (const t of item.tasks) {
      map.set(t.id, (map.get(t.id) ?? 0) + item.recommendedDeltaHours);
    }
  }
  return map;
});

function showActionStatus(msg: string) {
  sprintStatusText.value = msg;
  if (sprintStatusTimer) clearTimeout(sprintStatusTimer);
  sprintStatusTimer = setTimeout(() => {
    sprintStatusText.value = null;
  }, 4500);
}

function handleSprintImported(summary: {
  createdCount: number;
  updatedCount: number;
  iterationName: string;
}) {
  showActionStatus(
    t('tasks.sprintImportSuccess', {
      created: summary.createdCount,
      updated: summary.updatedCount,
      sprint: summary.iterationName || '',
    })
  );
}

function focusRowByTaskId(taskId: EntityId | null) {
  if (!taskId || import.meta.server) return;
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-task-focus-id="${CSS.escape(taskId)}"]`
    );
    el?.focus({ preventScroll: false });
  });
}

function dispatchSelection(action: TaskSelectionAction, focusDom = false) {
  selectionState.value = computeTaskSelectionTransition(
    selectionState.value,
    action,
    orderedTaskIds.value
  );
  if (focusDom && selectionState.value.focusedId) {
    focusRowByTaskId(selectionState.value.focusedId);
  }
}

function handleRowSelect(payload: {
  taskId: EntityId;
  shiftKey: boolean;
  ctrlOrMetaKey: boolean;
  toggleOnly?: boolean;
}) {
  if (payload.shiftKey) {
    dispatchSelection({
      type: 'range',
      taskId: payload.taskId,
      additive: payload.ctrlOrMetaKey,
    });
    return;
  }
  if (payload.ctrlOrMetaKey || payload.toggleOnly) {
    dispatchSelection({ type: 'toggle', taskId: payload.taskId });
    return;
  }
  dispatchSelection({ type: 'plain', taskId: payload.taskId });
}

function handlePrepareContextMenu(taskId: EntityId) {
  if (!selectedTaskIdSet.value.has(taskId)) {
    dispatchSelection({ type: 'plain', taskId });
  }
}

function toggleTaskCollapsed(taskId: EntityId) {
  const next = new Set(manualCollapsedIds.value);
  if (effectiveCollapsedIds.value.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
  }
  manualCollapsedIds.value = next;
}

function toggleAllExpanded() {
  const next = new Set(manualCollapsedIds.value);
  if (allExpanded.value) {
    for (const id of expandableParentIds.value) {
      next.add(id);
    }
  } else {
    for (const id of expandableParentIds.value) {
      next.delete(id);
    }
  }
  manualCollapsedIds.value = next;
}

function ensureExpanded(taskId: EntityId | null | undefined) {
  if (!taskId) return;
  if (manualCollapsedIds.value.has(taskId)) {
    const next = new Set(manualCollapsedIds.value);
    next.delete(taskId);
    manualCollapsedIds.value = next;
  }
}

function openTaskDetailModal(taskId: EntityId) {
  detailModalTaskId.value = taskId;
  detailModalOpen.value = true;
}

function openSubtaskComposer(parentTaskId: EntityId | null) {
  if (parentTaskId) {
    ensureExpanded(parentTaskId);
  }
  addingSubtaskForId.value = parentTaskId;
}

// Google-Tasks bordered/toggled top composer
function openQuickComposer() {
  quickComposerOpen.value = true;
  nextTick(() => {
    quickTaskInputRef.value?.focus();
  });
}

async function commitQuickAdd(opts: { keepFocus: boolean; addSubtaskAfter?: boolean }) {
  if (!authStore.user || !selectedProject.value || isQuickCommitting) return;
  const title = quickTaskTitle.value.trim();
  if (!title) {
    if (!opts.keepFocus && !opts.addSubtaskAfter) {
      quickComposerOpen.value = false;
    }
    return;
  }

  isQuickCommitting = true;
  quickTaskTitle.value = '';
  try {
    const created = await catalogStore.createTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      projectId: selectedProject.value.id,
      parentTaskId: null,
      name: title,
    });
    if (opts.addSubtaskAfter) {
      quickComposerOpen.value = false;
      nextTick(() => {
        openSubtaskComposer(created.id);
      });
    } else if (opts.keepFocus) {
      nextTick(() => {
        quickTaskInputRef.value?.focus();
      });
    } else {
      quickComposerOpen.value = false;
    }
  } finally {
    isQuickCommitting = false;
  }
}

function handleQuickAddKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.shiftKey) {
      void commitQuickAdd({ keepFocus: false, addSubtaskAfter: true });
    } else {
      void commitQuickAdd({ keepFocus: true });
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    quickTaskTitle.value = '';
    quickComposerOpen.value = false;
  }
}

function handleQuickAddBlur() {
  setTimeout(() => {
    if (suppressQuickBlur.value) {
      suppressQuickBlur.value = false;
      return;
    }
    if (quickTaskTitle.value.trim()) {
      void commitQuickAdd({ keepFocus: false });
    } else {
      quickComposerOpen.value = false;
    }
  }, 140);
}

async function handleQuickPickAdo(adoItem: AdoSelectedWorkItem | null) {
  suppressQuickBlur.value = false;
  if (!authStore.user || !selectedProject.value || !adoItem) return;

  const typed = quickTaskTitle.value.trim();
  quickTaskTitle.value = '';
  await catalogStore.createTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    parentTaskId: null,
    name: typed || adoItem.title.slice(0, 200),
    externalWorkItemId: String(adoItem.id),
    externalWorkItemTitle: adoItem.title,
    externalWorkItemType: adoItem.workItemType,
    externalWorkItemUrl: adoItem.url,
    externalOrgUrl: adoItem.orgUrl,
    externalProject: adoItem.project,
    completedWorkHours: adoItem.completedWork,
    externalSyncedAt: new Date().toISOString(),
  });
  nextTick(() => {
    quickTaskInputRef.value?.focus();
  });
}

async function handleCreateSubtask(payload: {
  parentTaskId: EntityId;
  name: string;
  addChildAfter?: boolean;
}) {
  if (!authStore.user || !selectedProject.value || !payload.name.trim()) return;
  const created = await catalogStore.createTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    parentTaskId: payload.parentTaskId,
    name: payload.name.trim(),
  });
  ensureExpanded(payload.parentTaskId);
  if (payload.addChildAfter && (created.depth ?? 0) < 2) {
    nextTick(() => {
      openSubtaskComposer(created.id);
    });
  }
}

async function handleCommitInlineRename(payload: {
  taskId: EntityId;
  name: string;
  addSubtaskAfter?: boolean;
  reparentTarget?: EntityId | null;
}) {
  editingTaskId.value = null;
  if (!authStore.user) return;
  const target = catalogStore.getTaskById(payload.taskId);
  if (!target) return;

  const cleanName = payload.name.trim();
  if (cleanName && cleanName !== target.name) {
    await catalogStore.updateTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: payload.taskId,
      name: cleanName,
    });
  }

  if (payload.reparentTarget !== undefined) {
    const moved = await catalogStore.reparentTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: payload.taskId,
      newParentTaskId: payload.reparentTarget,
    });
    if (moved) {
      ensureExpanded(payload.reparentTarget);
    }
    nextTick(() => {
      editingTaskId.value = payload.taskId;
    });
    return;
  }

  if (payload.addSubtaskAfter && (target.depth ?? 0) < 2) {
    nextTick(() => {
      openSubtaskComposer(payload.taskId);
    });
    return;
  }

  focusRowByTaskId(payload.taskId);
}

async function handleUpdateTaskTags(payload: { taskId: EntityId; tagIds: EntityId[] }) {
  if (!authStore.user) return;
  const target = catalogStore.getTaskById(payload.taskId);
  if (!target) return;
  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    name: target.name,
    tagIds: payload.tagIds,
  });
}

async function handleReparent(payload: { taskId: EntityId; newParentTaskId: EntityId | null }) {
  if (!authStore.user) return;
  const moved = await catalogStore.reparentTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    newParentTaskId: payload.newParentTaskId,
  });
  if (moved) {
    ensureExpanded(payload.newParentTaskId);
    focusRowByTaskId(payload.taskId);
  }
}

function findNodeChildrenIds(nodes: readonly TaskTreeNode[], parentId: EntityId): EntityId[] | null {
  for (const node of nodes) {
    if (node.task.id === parentId) {
      return node.children.map((c) => c.task.id);
    }
    const found = findNodeChildrenIds(node.children, parentId);
    if (found) return found;
  }
  return null;
}

function resolveDisplayedSiblingIds(task: Task): EntityId[] {
  if (!task.parentTaskId) {
    const activeIds = activePagination.value.items.map((n) => n.task.id);
    if (activeIds.includes(task.id)) return activeIds;
    const completedIds = completedRoots.value.map((n) => n.task.id);
    if (completedIds.includes(task.id)) return completedIds;
    return rawProjectTreeRoots.value.map((n) => n.task.id);
  }

  return (
    findNodeChildrenIds(activeRoots.value, task.parentTaskId) ??
    findNodeChildrenIds(completedRoots.value, task.parentTaskId) ??
    findNodeChildrenIds(rawProjectTreeRoots.value, task.parentTaskId) ??
    []
  );
}

async function handleReorder(payload: { taskId: EntityId; targetIndex: number }) {
  if (!authStore.user) return;
  const task = catalogStore.getTaskById(payload.taskId);
  if (!task) return;

  const fullSiblings = catalogStore
    .getTasksForProject(task.projectId)
    .filter((t) => (t.parentTaskId ?? null) === (task.parentTaskId ?? null))
    .sort(compareTasksByPriority)
    .map((t) => t.id);

  const displayedIds = resolveDisplayedSiblingIds(task);
  const withoutMovedDisplayed = displayedIds.filter((id) => id !== payload.taskId);
  const clampedLocal = Math.max(0, Math.min(payload.targetIndex, withoutMovedDisplayed.length));
  const withoutMovedFull = fullSiblings.filter((id) => id !== payload.taskId);

  let globalTargetIndex = clampedLocal;
  const anchorAfter = withoutMovedDisplayed[clampedLocal];
  if (anchorAfter) {
    const idx = withoutMovedFull.indexOf(anchorAfter);
    if (idx !== -1) globalTargetIndex = idx;
  } else if (clampedLocal > 0) {
    const anchorBefore = withoutMovedDisplayed[clampedLocal - 1];
    if (anchorBefore) {
      const idx = withoutMovedFull.indexOf(anchorBefore);
      if (idx !== -1) globalTargetIndex = idx + 1;
    }
  }

  const moved = await catalogStore.reorderTaskSiblings({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    targetIndex: globalTargetIndex,
  });
  if (moved) {
    focusRowByTaskId(payload.taskId);
  }
}

// Instant in-place timer start & stop without leaving /app/tasks (#4)
async function handleStartTimerFromTask(taskId: EntityId) {
  if (!authStore.user) return;
  await timerStore.startTimerFromTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId,
  });
}

async function handleStopRunningTimer() {
  if (!authStore.user) return;
  await timerStore.stopTimer({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
  });
}

async function handleToggleDone(payload: { taskId: EntityId; current: TaskStatus }) {
  if (!authStore.user) return;
  const next: TaskStatus = payload.current === 'done' ? 'todo' : 'done';
  await catalogStore.updateTaskStatus({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: payload.taskId,
    status: next,
  });
}

function resolveActionTargetIds(triggerTaskId: EntityId): EntityId[] {
  if (
    selectionState.value.selectedIds.length > 1 &&
    selectedTaskIdSet.value.has(triggerTaskId)
  ) {
    return orderedTaskIds.value.filter((id) => selectedTaskIdSet.value.has(id));
  }
  return [triggerTaskId];
}

function resolveActionTasks(triggerTaskId: EntityId): Task[] {
  const ids = resolveActionTargetIds(triggerTaskId);
  return ids
    .map((id) => catalogStore.getTaskById(id))
    .filter((t): t is Task => Boolean(t));
}

async function handleDuplicateTasks(triggerTaskId: EntityId) {
  if (!authStore.user) return;
  const sourceIds = resolveActionTargetIds(triggerTaskId);
  if (sourceIds.length === 0) return;

  const createdRoots = await catalogStore.duplicateTaskSubtree({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    sourceTaskIds: sourceIds,
  });

  if (createdRoots.length > 0) {
    showActionStatus(t('tasks.toast.duplicated', { count: createdRoots.length }));
    if (createdRoots.length === 1) {
      const clone = createdRoots[0]!;
      dispatchSelection({ type: 'plain', taskId: clone.id });
      nextTick(() => {
        editingTaskId.value = clone.id;
      });
    } else {
      selectionState.value = {
        selectedIds: createdRoots.map((c) => c.id),
        anchorId: createdRoots[0]!.id,
        focusedId: createdRoots[0]!.id,
      };
    }
  }
}

async function handlePasteClipboardTasks() {
  if (!authStore.user || clipboardTaskIds.value.length === 0) return;
  const validSourceIds = clipboardTaskIds.value.filter((id) => catalogStore.getTaskById(id));
  if (validSourceIds.length === 0) return;

  const focusId = effectiveFocusedTaskId.value;
  const focusedTask = focusId ? catalogStore.getTaskById(focusId) : undefined;
  let targetParentTaskId: EntityId | null | undefined;
  if (focusedTask && !validSourceIds.includes(focusedTask.id)) {
    targetParentTaskId = focusedTask.parentTaskId ?? null;
  }

  const createdRoots = await catalogStore.duplicateTaskSubtree({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    sourceTaskIds: validSourceIds,
    targetProjectId: selectedProjectId.value,
    targetParentTaskId,
  });

  if (createdRoots.length > 0) {
    showActionStatus(t('tasks.toast.pasted', { count: createdRoots.length }));
    if (createdRoots.length === 1) {
      dispatchSelection({ type: 'plain', taskId: createdRoots[0]!.id }, true);
    } else {
      selectionState.value = {
        selectedIds: createdRoots.map((c) => c.id),
        anchorId: createdRoots[0]!.id,
        focusedId: createdRoots[0]!.id,
      };
    }
  }
}

async function handleBulkMarkStatus(status: TaskStatus) {
  if (!authStore.user || selectionState.value.selectedIds.length === 0) return;
  await catalogStore.updateTasksStatusBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskIds: selectionState.value.selectedIds,
    status,
  });
  showActionStatus(
    status === 'done' ? t('tasks.toast.markedDone') : t('tasks.toast.markedTodo')
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (import.meta.server) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

async function handleExportMarkdown(triggerTaskId: EntityId) {
  const tasks = resolveActionTasks(triggerTaskId);
  if (tasks.length === 0) return;

  const md = tasksToMarkdownTable(tasks, {
    allTasks: catalogStore.tasks,
    projects: catalogStore.projects,
    tags: catalogStore.tags,
    trackedSecondsByTask: trackedSecondsByTask.value,
  });
  await copyTextToClipboard(md);
  showActionStatus(t('tasks.toast.markdownCopied', { count: tasks.length }));
}

function handleExportCsv(triggerTaskId: EntityId) {
  const tasks = resolveActionTasks(triggerTaskId);
  if (tasks.length === 0 || import.meta.server) return;

  const csv = tasksToCsv(tasks, {
    allTasks: catalogStore.tasks,
    projects: catalogStore.projects,
    tags: catalogStore.tags,
    trackedSecondsByTask: trackedSecondsByTask.value,
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `klox-tasks-${todayDateKey.value}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showActionStatus(t('tasks.toast.csvExported', { count: tasks.length }));
}

function openCreateAdoModal(task: Task) {
  createAdoTargetTask.value = task;
  createAdoDialogOpen.value = true;
}

const createAdoDirectLogs = computed(() => {
  if (!createAdoTargetTask.value) return [];
  const descendantIds = new Set(
    collectDescendantTaskIds(createAdoTargetTask.value.id, catalogStore.tasks)
  );
  return timeLogsStore.logs.filter((l) => l.taskId && descendantIds.has(l.taskId));
});

const createAdoUnsyncedSeconds = computed(() =>
  createAdoDirectLogs.value.reduce((sum, l) => sum + l.durationSeconds, 0)
);

async function handleRefreshProjectAdo() {
  if (!authStore.user || !projectConnection.value || refreshingAdo.value) return;
  const linked = catalogStore.getTasksForProject(selectedProjectId.value).filter(
    (t) => t.externalProvider === 'azure_devops' && t.externalWorkItemId
  );
  if (linked.length === 0) return;

  refreshingAdo.value = true;
  try {
    const groupsMap = new Map<
      string,
      { connectionId: string; orgUrl: string; project: string; ids: number[] }
    >();
    for (const t of linked) {
      const id = parseWorkItemIdInput(t.externalWorkItemId);
      if (!id) continue;
      const orgUrl = t.externalOrgUrl || projectConnection.value.orgUrl;
      const project = t.externalProject || projectConnection.value.defaultProject;
      const key = `${projectConnection.value.id}::${orgUrl.toLowerCase()}::${project.toLowerCase()}`;
      let grp = groupsMap.get(key);
      if (!grp) {
        grp = { connectionId: projectConnection.value.id, orgUrl, project, ids: [] };
        groupsMap.set(key, grp);
      }
      if (!grp.ids.includes(id)) grp.ids.push(id);
    }
    await adoStore.pullWorkItems({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      targets: Array.from(groupsMap.values()),
    });
  } finally {
    refreshingAdo.value = false;
  }
}

function requestDeleteTask(task: Task) {
  const ids = collectDescendantTaskIds(task.id, catalogStore.tasks);
  pendingDelete.value = {
    kind: 'single',
    taskId: task.id,
    name: task.name,
    descendantCount: Math.max(0, ids.length - 1),
  };
}

function requestBulkDeleteSelected() {
  const selectedIds = selectionState.value.selectedIds;
  const targetIds =
    selectedIds.length > 0
      ? selectedIds
      : effectiveFocusedTaskId.value
        ? [effectiveFocusedTaskId.value]
        : [];
  if (targetIds.length === 0) return;
  const allToDelete = collectBulkDeleteTaskIds(targetIds, catalogStore.tasks);
  if (allToDelete.length === 0) return;

  if (targetIds.length === 1) {
    const single = catalogStore.getTaskById(targetIds[0]);
    if (single) {
      requestDeleteTask(single);
      return;
    }
  }

  pendingDelete.value = {
    kind: 'bulk',
    taskIds: [...targetIds],
    selectedCount: targetIds.length,
    totalDeleteCount: allToDelete.length,
  };
}

const confirmDeleteTitle = computed(() => {
  if (!pendingDelete.value) return '';
  return pendingDelete.value.kind === 'bulk'
    ? t('confirm.deleteTasksBulkTitle', { count: pendingDelete.value.selectedCount })
    : t('confirm.deleteTaskTitle');
});

const confirmDeleteDesc = computed(() => {
  const target = pendingDelete.value;
  if (!target) return '';
  if (target.kind === 'bulk') {
    return t('confirm.deleteTasksBulkDesc', {
      selectedCount: target.selectedCount,
      totalCount: target.totalDeleteCount,
    });
  }
  if (target.descendantCount > 0) {
    return t('confirm.deleteTaskCascadeDesc', {
      name: target.name,
      descendantCount: target.descendantCount,
    });
  }
  return t('confirm.deleteTaskDesc', { name: target.name });
});

async function confirmDeleteAction() {
  if (!authStore.user || !pendingDelete.value || isDeleting.value) return;
  isDeleting.value = true;
  try {
    const target = pendingDelete.value;
    if (target.kind === 'single') {
      await catalogStore.deleteTask({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        taskId: target.taskId,
      });
      if (detailModalTaskId.value === target.taskId) {
        detailModalOpen.value = false;
        detailModalTaskId.value = null;
      }
      selectionState.value = computeTaskSelectionTransition(
        {
          ...selectionState.value,
          selectedIds: selectionState.value.selectedIds.filter((id) => id !== target.taskId),
        },
        { type: 'clear' },
        orderedTaskIds.value
      );
    } else {
      await catalogStore.deleteTasksBatch({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        taskIds: target.taskIds,
      });
      if (detailModalTaskId.value && target.taskIds.includes(detailModalTaskId.value)) {
        detailModalOpen.value = false;
        detailModalTaskId.value = null;
      }
      selectionState.value = { selectedIds: [], anchorId: null, focusedId: null };
    }
    pendingDelete.value = null;
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="w-full space-y-5">
    <!-- Top Header & Azure DevOps Sync Trigger -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
            {{ $t('tasks.title') }}
          </h1>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('tasks.subtitle') }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="projectConnection"
            type="button"
            :disabled="refreshingAdo"
            class="btn-press inline-flex h-10 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:border-signal transition-colors disabled:opacity-50"
            @click="handleRefreshProjectAdo"
          >
            <RefreshCw class="h-3.5 w-3.5 text-signal" :class="refreshingAdo ? 'animate-spin' : ''" aria-hidden="true" />
            <span>{{ $t('tasks.refreshAdoButton') }}</span>
          </button>

          <button
            v-if="adoStore.isConnected"
            type="button"
            data-testid="tasks-open-ado-sync"
            class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            @click="syncReviewOpen = true"
          >
            <GitBranch class="h-4 w-4" aria-hidden="true" />
            <span>{{ $t('tasks.syncAdoButton') }}</span>
            <span
              v-if="syncCandidates.totalRecommendedHours > 0"
              class="tabular-telemetry border border-white/30 bg-white/15 px-1.5 py-0.5 text-xs"
            >
              +{{ syncCandidates.totalRecommendedHours.toFixed(2) }}h
            </span>
          </button>

          <NuxtLink
            v-else
            :to="localePath('/app/settings#azure-devops')"
            class="btn-press inline-flex h-10 items-center gap-2 border border-signal/50 bg-signal-soft px-4 text-xs font-semibold uppercase tracking-wider text-signal hover:bg-accent hover:text-white transition-colors"
          >
            <GitBranch class="h-4 w-4" aria-hidden="true" />
            <span>{{ $t('tasks.connectAdoCta') }}</span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Orbital Loading Skeleton While Hydrating Tasks (#5) -->
    <div
      v-if="isInitialLoading"
      data-testid="tasks-loading-skeleton"
      class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-4 sm:p-6 space-y-4"
    >
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
        <div class="flex items-center gap-2.5">
          <div class="h-10 w-48 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
          <div class="h-10 w-32 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
        </div>
        <div class="h-10 w-52 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
      </div>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div class="h-10 sm:col-span-5 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
        <div class="h-10 sm:col-span-4 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
        <div class="h-10 sm:col-span-3 border border-border-hairline bg-bg-primary motion-safe:animate-pulse" />
      </div>

      <div class="divide-y divide-border-hairline border border-border-hairline bg-bg-primary">
        <div
          v-for="row in 6"
          :key="row"
          class="flex items-center justify-between gap-3 px-4 py-3.5"
        >
          <div class="flex items-center gap-3 flex-1">
            <div class="h-4 w-4 border border-border-hairline bg-bg-elevated motion-safe:animate-pulse" />
            <div class="h-[18px] w-[18px] rounded-full border border-border-hairline bg-bg-elevated motion-safe:animate-pulse" />
            <div
              class="h-4 bg-bg-elevated motion-safe:animate-pulse"
              :class="row % 2 === 0 ? 'w-3/5' : 'w-2/5'"
            />
          </div>
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 border border-border-hairline bg-bg-elevated motion-safe:animate-pulse" />
            <div class="h-8 w-8 border border-border-hairline bg-bg-elevated motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    </div>

    <!-- Full-Width Execution Board -->
    <div
      v-else-if="selectedProject"
      class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-4 sm:p-6 space-y-4"
    >
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

      <!-- Row 1: Project Scope + Google-Tasks "+ Add task" Trigger + Sprint Picker -->
      <div class="flex flex-col gap-3 border-b border-border-hairline pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-2.5 min-w-0">
          <TasksTaskProjectFilterPopover
            v-model="selectedProjectId"
            :unsynced-hours-by-project="unsyncedHoursByProject"
          />

          <button
            type="button"
            data-testid="tasks-add-task-btn"
            class="btn-press inline-flex h-10 items-center gap-2 border border-signal/50 bg-signal-soft px-3.5 text-xs font-semibold text-signal hover:bg-accent hover:text-white transition-colors"
            @click="openQuickComposer"
          >
            <Plus class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('tasks.addTaskButton') }}</span>
            <UiKeycapBadge keys="A" class="hidden sm:inline-flex" />
          </button>
        </div>

        <div
          v-if="projectConnection"
          class="flex flex-wrap items-center gap-2"
        >
          <AdoSprintPickerPopover
            v-model="selectedIterationPath"
            :iterations="projectIterations"
            :loading="loadingIterations"
          />

          <button
            type="button"
            data-testid="tasks-fetch-sprint-btn"
            :disabled="loadingIterations"
            class="btn-press inline-flex h-10 items-center gap-2 border border-signal/50 bg-signal-soft px-3.5 text-xs font-semibold uppercase tracking-wider text-signal hover:bg-accent hover:text-white transition-colors disabled:opacity-50"
            @click="sprintImportOpen = true"
          >
            <Download class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('tasks.fetchSprintButton') }}</span>
          </button>
        </div>

        <div
          v-else-if="selectedProject.systemKey !== 'unassigned'"
          class="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted"
        >
          <span>{{ $t('tasks.bindProjectAdoHint') }}</span>
          <NuxtLink
            :to="localePath(`/app/settings?projectId=${selectedProject.id}#azure-devops`)"
            class="font-medium text-signal hover:underline shrink-0"
          >
            {{ $t('projects.connectAdoProjectButton') }}
          </NuxtLink>
        </div>
      </div>

      <!-- Row 2: Tree-Aware Board Filter Bar (#12) -->
      <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end">
        <div class="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            v-model="searchQuery"
            type="search"
            data-testid="tasks-filter-search"
            :aria-label="$t('tasks.filters.searchAria')"
            :placeholder="$t('tasks.filters.searchPlaceholder')"
            class="h-10 w-full border border-border-input bg-bg-primary pl-9 pr-8 text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            :aria-label="$t('tasks.filters.clear')"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div class="w-full sm:w-56">
          <UiFilterMultiSelect
            v-model="selectedFilterTagIds"
            :options="tagFilterOptions"
            :label="$t('tasks.filters.tagsLabel')"
            :placeholder="$t('tasks.filters.allTags')"
            test-id="tasks-filter-tags"
          />
        </div>

        <div class="w-full sm:w-44">
          <select
            v-model="selectedLinkFilter"
            data-testid="tasks-filter-link"
            :aria-label="$t('tasks.filters.linkLabel')"
            class="h-10 w-full border border-border-input bg-bg-primary px-3 text-ui text-text-primary focus:border-signal focus:outline-none"
          >
            <option value="all">{{ $t('tasks.filters.link_all') }}</option>
            <option value="ado_linked">{{ $t('tasks.filters.link_ado_linked') }}</option>
            <option value="unlinked">{{ $t('tasks.filters.link_unlinked') }}</option>
            <option value="has_deadline">{{ $t('tasks.filters.link_has_deadline') }}</option>
            <option value="overdue">{{ $t('tasks.filters.link_overdue') }}</option>
          </select>
        </div>

        <button
          v-if="hasActiveFilters"
          type="button"
          data-testid="tasks-filters-clear"
          class="btn-press inline-flex h-10 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted hover:border-signal hover:text-text-primary transition-colors"
          @click="clearAllFilters"
        >
          <X class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('tasks.filters.clear') }}</span>
        </button>
      </div>

      <!-- Sprint / Clipboard Action Toast Status -->
      <div v-if="sprintStatusText || sprintError" class="flex items-center justify-between text-xs">
        <span v-if="sprintStatusText" role="status" class="font-medium text-emerald-500">
          {{ sprintStatusText }}
        </span>
        <span v-else-if="sprintError" role="alert" class="text-destructive">
          {{ $t(`ado.errors.${sprintError}`) }}
        </span>
      </div>

      <!-- Compact Multi-Selection Status Bar (Zero Giant Red Delete Button — #7) -->
      <div
        v-if="selectionState.selectedIds.length > 0"
        data-testid="tasks-bulk-selection-bar"
        class="flex flex-wrap items-center justify-between gap-2.5 border border-signal/35 bg-signal-soft/50 px-3.5 py-2 text-xs"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span class="tabular-telemetry inline-flex items-center gap-1.5 font-semibold text-signal">
            <CheckSquare class="h-4 w-4" aria-hidden="true" />
            <span>{{ $t('tasks.selection.selectedCount', { count: selectionState.selectedIds.length }) }}</span>
          </span>

          <span class="hidden sm:inline text-text-muted">
            {{ $t('tasks.selection.menuHint') }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            v-if="selectionState.selectedIds.length === 1"
            type="button"
            data-testid="tasks-selection-open-detail"
            class="inline-flex items-center gap-1 font-medium text-text-primary hover:text-signal hover:underline"
            @click="openTaskDetailModal(selectionState.selectedIds[0]!)"
          >
            <SlidersHorizontal class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('tasks.rowMenu.openDetails') }}</span>
          </button>

          <button
            v-if="selectionState.selectedIds.length < orderedTaskIds.length"
            type="button"
            data-testid="tasks-selection-select-all"
            class="font-medium text-signal hover:underline"
            @click="dispatchSelection({ type: 'selectAll' })"
          >
            {{ $t('tasks.selection.selectAll') }}
          </button>

          <button
            type="button"
            data-testid="tasks-selection-clear"
            class="text-text-muted hover:text-text-primary hover:underline"
            @click="dispatchSelection({ type: 'clear' })"
          >
            {{ $t('tasks.selection.clear') }}
          </button>
        </div>
      </div>

      <!-- Google-Tasks Toggled Borderless Inline Add Row (#14) -->
      <div
        v-if="quickComposerOpen"
        data-testid="tasks-inline-composer"
        class="flex items-center gap-2.5 border-b-2 border-signal bg-bg-primary/90 px-3.5 py-2.5"
      >
        <Plus class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
        <label for="tasks-quick-add" class="sr-only">
          {{ $t('tasks.quickAddAria') }}
        </label>
        <input
          id="tasks-quick-add"
          ref="quickTaskInputRef"
          v-model="quickTaskTitle"
          type="text"
          maxlength="200"
          enterkeyhint="done"
          data-testid="tasks-new-name-input"
          :placeholder="$t('tasks.quickAddPlaceholder')"
          class="h-8 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
          @keydown="handleQuickAddKeydown"
          @blur="handleQuickAddBlur"
        />
        <div
          v-if="projectConnection"
          class="shrink-0"
          @pointerdown="suppressQuickBlur = true"
        >
          <AdoWorkItemPickerPopover
            variant="pill"
            :connection-id="projectConnection.id"
            :org-url="effectiveAdoTarget?.orgUrl"
            :project="effectiveAdoTarget?.project"
            @select="handleQuickPickAdo"
          />
        </div>
        <button
          type="button"
          :aria-label="$t('confirm.cancelAction')"
          class="text-text-muted hover:text-text-primary p-1"
          @pointerdown="suppressQuickBlur = true"
          @click="quickComposerOpen = false; quickTaskTitle = ''"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Empty / Filter-No-Match States -->
      <div
        v-if="rawProjectTreeRoots.length === 0 && !quickComposerOpen"
        class="border border-border-hairline bg-bg-primary p-8 text-center text-ui text-text-muted"
      >
        <p>{{ $t('catalog.noTasksYet') }}</p>
        <button
          type="button"
          class="btn-press mt-3 inline-flex h-9 items-center gap-2 border border-signal/50 bg-signal-soft px-3.5 text-xs font-semibold text-signal hover:bg-accent hover:text-white transition-colors"
          @click="openQuickComposer"
        >
          <Plus class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('tasks.addTaskButton') }}</span>
        </button>
      </div>

      <div
        v-else-if="filteredTreeResult.roots.length === 0 && !quickComposerOpen"
        class="border border-border-hairline bg-bg-primary p-6 text-center text-ui text-text-muted"
      >
        <p>{{ $t('tasks.filters.noFilterMatches') }}</p>
        <button
          type="button"
          class="mt-2 text-xs font-medium text-signal hover:underline"
          @click="clearAllFilters"
        >
          {{ $t('tasks.filters.clear') }}
        </button>
      </div>

      <!-- Active Tasks Tree & Dynamic Pagination (#1, #11, #13) -->
      <template v-else>
        <div
          v-if="activePagination.items.length > 0"
          data-testid="tasks-tree-region"
        >
          <TasksTaskTreeLevel
            :nodes="activePagination.items"
            :depth="0"
            :parent-parent-task-id="null"
            :inherited-ado-task="null"
            :running-task-id="timerStore.isRunning ? timerStore.taskId : null"
            :running-elapsed-seconds="timerStore.currentElapsedSeconds"
            :tracked-seconds-by-task="trackedSecondsByTask"
            :unsynced-hours-by-task="unsyncedHoursByTask"
            :project-tags="projectTags"
            :selected-task-ids="selectedTaskIdSet"
            :selected-count="selectionState.selectedIds.length"
            :focused-task-id="effectiveFocusedTaskId"
            :multi-select-mode="selectionState.selectedIds.length > 1"
            :collapsed-task-ids="effectiveCollapsedIds"
            :editing-task-id="editingTaskId"
            :adding-subtask-for-id="addingSubtaskForId"
            @reorder="handleReorder"
            @reparent="handleReparent"
            @create-subtask="handleCreateSubtask"
            @open-subtask-composer="openSubtaskComposer"
            @start-inline-rename="editingTaskId = $event"
            @commit-inline-rename="handleCommitInlineRename"
            @update-tags="handleUpdateTaskTags"
            @start-timer="handleStartTimerFromTask"
            @stop-timer="handleStopRunningTimer"
            @toggle-done="handleToggleDone"
            @delete-task="requestDeleteTask"
            @bulk-delete="requestBulkDeleteSelected"
            @bulk-mark-status="handleBulkMarkStatus"
            @duplicate-tasks="handleDuplicateTasks"
            @export-markdown="handleExportMarkdown"
            @export-csv="handleExportCsv"
            @toggle-collapse="toggleTaskCollapsed"
            @open-details="openTaskDetailModal"
            @prepare-context-menu="handlePrepareContextMenu"
            @row-select="handleRowSelect"
          />
        </div>

        <TasksTasksPaginationBar
          v-if="activeRoots.length > 0"
          :window="activePagination"
          :has-expandable-parents="expandableParentIds.length > 0"
          :all-expanded="allExpanded"
          @navigate="pageIndex = $event"
          @update:page-size="handleUpdatePageSize"
          @toggle-all-expanded="toggleAllExpanded"
        />

        <!-- Separate Collapsible Completed Section (#13) -->
        <section
          v-if="completedRoots.length > 0"
          data-testid="tasks-completed-section"
          class="border border-border-hairline bg-bg-primary/60"
        >
          <button
            type="button"
            data-testid="tasks-completed-toggle"
            :aria-expanded="completedExpanded"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted hover:bg-bg-hover/40 hover:text-text-primary transition-colors"
            @click="completedExpanded = !completedExpanded"
          >
            <span class="inline-flex items-center gap-2">
              <ChevronDown
                v-if="completedExpanded"
                class="h-4 w-4 text-emerald-500"
                aria-hidden="true"
              />
              <ChevronRight
                v-else
                class="h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <Check class="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              <span>{{ $t('tasks.completedSection.title') }}</span>
              <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-primary">
                {{ completedRoots.length }}
              </span>
            </span>
            <span class="hidden sm:inline font-normal normal-case tracking-normal text-text-faint">
              {{ $t('tasks.completedSection.allDoneHint') }}
            </span>
          </button>

          <div
            v-if="completedExpanded"
            class="border-t border-border-hairline"
          >
            <TasksTaskTreeLevel
              :nodes="completedRoots"
              :depth="0"
              :parent-parent-task-id="null"
              :inherited-ado-task="null"
              :running-task-id="timerStore.isRunning ? timerStore.taskId : null"
              :running-elapsed-seconds="timerStore.currentElapsedSeconds"
              :tracked-seconds-by-task="trackedSecondsByTask"
              :unsynced-hours-by-task="unsyncedHoursByTask"
              :project-tags="projectTags"
              :selected-task-ids="selectedTaskIdSet"
              :selected-count="selectionState.selectedIds.length"
              :focused-task-id="effectiveFocusedTaskId"
              :multi-select-mode="selectionState.selectedIds.length > 1"
              :collapsed-task-ids="effectiveCollapsedIds"
              :editing-task-id="editingTaskId"
              :adding-subtask-for-id="addingSubtaskForId"
              @reorder="handleReorder"
              @reparent="handleReparent"
              @create-subtask="handleCreateSubtask"
              @open-subtask-composer="openSubtaskComposer"
              @start-inline-rename="editingTaskId = $event"
              @commit-inline-rename="handleCommitInlineRename"
              @update-tags="handleUpdateTaskTags"
              @start-timer="handleStartTimerFromTask"
              @stop-timer="handleStopRunningTimer"
              @toggle-done="handleToggleDone"
              @delete-task="requestDeleteTask"
              @bulk-delete="requestBulkDeleteSelected"
              @bulk-mark-status="handleBulkMarkStatus"
              @duplicate-tasks="handleDuplicateTasks"
              @export-markdown="handleExportMarkdown"
              @export-csv="handleExportCsv"
              @toggle-collapse="toggleTaskCollapsed"
              @open-details="openTaskDetailModal"
              @prepare-context-menu="handlePrepareContextMenu"
              @row-select="handleRowSelect"
            />
          </div>
        </section>
      </template>
    </div>

    <!-- Dedicated Azure DevOps / Jira-Style Task & Work Item Card Modal -->
    <TasksTaskDetailModal
      v-model:open="detailModalOpen"
      :task-id="detailModalTaskId"
      :running-task-id="timerStore.isRunning ? timerStore.taskId : null"
      :running-elapsed-seconds="timerStore.currentElapsedSeconds"
      :tracked-seconds-by-task="trackedSecondsByTask"
      :unsynced-hours-by-task="unsyncedHoursByTask"
      :ado-connected="Boolean(projectConnection)"
      :ado-connection-id="projectConnection?.id"
      :ado-org-url="effectiveAdoTarget?.orgUrl"
      :ado-project="effectiveAdoTarget?.project"
      :ado-enabled-for-project="Boolean(effectiveAdoTarget?.enabled)"
      @start-timer="handleStartTimerFromTask"
      @stop-timer="handleStopRunningTimer"
      @delete-task="requestDeleteTask"
      @create-ado="openCreateAdoModal"
      @select-task-card="openTaskDetailModal"
    />

    <!-- Sprint Import Confirmation & Selection Modal -->
    <AdoSprintImportDialog
      v-model:open="sprintImportOpen"
      :connection-id="projectConnection?.id"
      :klox-project-id="selectedProjectId"
      :iteration-path="selectedIterationPath"
      @imported="handleSprintImported"
    />

    <AdoCreateWorkItemDialog
      v-model:open="createAdoDialogOpen"
      :task="createAdoTargetTask"
      :connection-id="projectConnection?.id"
      :org-url="effectiveAdoTarget?.orgUrl"
      :project="effectiveAdoTarget?.project"
      :default-work-item-type="effectiveAdoTarget?.defaultWorkItemType"
      :unsynced-seconds="createAdoUnsyncedSeconds"
      :unsynced-log-ids="createAdoDirectLogs.map((l) => l.id)"
    />

    <AdoSyncReviewDialog v-model:open="syncReviewOpen" />

    <UiConfirmDialog
      :open="Boolean(pendingDelete)"
      :title="confirmDeleteTitle"
      :description="confirmDeleteDesc"
      :detail="pendingDelete?.kind === 'single' ? pendingDelete.name : undefined"
      :confirm-label="pendingDelete?.kind === 'bulk' ? $t('tasks.selection.deleteSelected', { count: pendingDelete.selectedCount }) : $t('confirm.deleteAction')"
      :cancel-label="$t('confirm.cancelAction')"
      :loading="isDeleting"
      @update:open="!$event && (pendingDelete = null)"
      @confirm="confirmDeleteAction"
    />
  </div>
</template>
