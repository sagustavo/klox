<script setup lang="ts">
import {
  AlignLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Play,
  Square,
} from 'lucide-vue-next';
import {
  type TaskTimerEligibility,
} from '~/domain/ado';
import { formatHMS, toDateKey } from '~/domain/duration';
import {
  MAX_TASK_DEPTH,
  classifyDueDateTone,
  type TaskTreeNode,
} from '~/domain/invariants';
import type { EntityId, ProjectTag, Task, TaskStatus } from '~/domain/types';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    nodes: readonly TaskTreeNode[];
    depth?: number;
    parentParentTaskId?: EntityId | null;
    inheritedAdoTask?: Task | null;
    runningTaskId?: EntityId | null;
    runningElapsedSeconds?: number;
    trackedSecondsByTask?: ReadonlyMap<EntityId, number>;
    unsyncedHoursByTask?: ReadonlyMap<EntityId, number>;
    effectiveCompletedHoursByTask?: ReadonlyMap<EntityId, number>;
    timerEligibilityByTask?: ReadonlyMap<EntityId, TaskTimerEligibility>;
    projectTags?: readonly ProjectTag[];
    selectedTaskIds?: ReadonlySet<EntityId>;
    selectedCount?: number;
    focusedTaskId?: EntityId | null;
    multiSelectMode?: boolean;
    collapsedTaskIds?: ReadonlySet<EntityId>;
    editingTaskId?: EntityId | null;
    addingSubtaskForId?: EntityId | null;
  }>(),
  {
    depth: 0,
    parentParentTaskId: null,
    inheritedAdoTask: null,
    runningTaskId: null,
    runningElapsedSeconds: 0,
    trackedSecondsByTask: () => new Map(),
    unsyncedHoursByTask: () => new Map(),
    effectiveCompletedHoursByTask: () => new Map(),
    timerEligibilityByTask: () => new Map(),
    projectTags: () => [],
    selectedTaskIds: () => new Set(),
    selectedCount: 0,
    focusedTaskId: null,
    multiSelectMode: false,
    collapsedTaskIds: () => new Set(),
    editingTaskId: null,
    addingSubtaskForId: null,
  }
);

const emit = defineEmits<{
  reorder: [payload: { taskId: EntityId; targetIndex: number }];
  reparent: [payload: { taskId: EntityId; newParentTaskId: EntityId | null }];
  createSubtask: [payload: { parentTaskId: EntityId; name: string; addChildAfter?: boolean }];
  openSubtaskComposer: [parentTaskId: EntityId | null];
  startInlineRename: [taskId: EntityId | null];
  commitInlineRename: [
    payload: {
      taskId: EntityId;
      name: string;
      addSubtaskAfter?: boolean;
      reparentTarget?: EntityId | null;
    },
  ];
  updateTags: [payload: { taskId: EntityId; tagIds: EntityId[] }];
  startTimer: [taskId: EntityId];
  stopTimer: [];
  toggleDone: [payload: { taskId: EntityId; current: TaskStatus }];
  deleteTask: [task: Task];
  bulkDelete: [];
  bulkUpdateTags: [];
  bulkMarkStatus: [status: TaskStatus];
  duplicateTasks: [taskId: EntityId];
  exportMarkdown: [taskId: EntityId];
  exportCsv: [taskId: EntityId];
  toggleCollapse: [taskId: EntityId];
  openDetails: [taskId: EntityId];
  prepareContextMenu: [taskId: EntityId];
  rowSelect: [
    payload: {
      taskId: EntityId;
      shiftKey: boolean;
      ctrlOrMetaKey: boolean;
      toggleOnly?: boolean;
    },
  ];
}>();

const { t } = useI18n();
const prefsStore = usePreferencesStore();
const { formatDateKey } = useFormat(() => prefsStore.preferences);

const todayDateKey = computed(() =>
  toDateKey(new Date(), prefsStore.preferences.timeZone || 'UTC')
);

const hasAnyExpandableHere = computed(() =>
  props.nodes.some((n) => n.children.length > 0)
);

// Controlled Inline Subtask Composer state
const inlineSubtaskDraft = ref('');
const subtaskInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
let isSubtaskCommitting = false;

// Controlled Inline Title Rename state
const inlineTitleDraft = ref('');
const inlineTitleInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
let isInlineTitleCommitting = false;
let cancelInlineTitleEdit = false;

// Grip-less Direct Row Drag-and-Drop Reorder state
const listRef = ref<HTMLUListElement | null>(null);
const itemRefs = ref<Array<HTMLLIElement | null>>([]);
const draggingTaskId = ref<EntityId | null>(null);
const activePointerId = ref<number | null>(null);
const dropGapIndex = ref<number | null>(null);
const dragOffsetY = ref(0);
const dragStartIndex = ref(-1);
const liveAnnouncement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | null = null;

// Pending pointer activation state (mouse 6px threshold, touch 220ms long-press)
let pendingTaskId: EntityId | null = null;
let pendingIdx = -1;
let pendingPointerId: number | null = null;
let pendingPointerType = 'mouse';
let pendingStartX = 0;
let pendingStartY = 0;
let pendingCapturedEl: HTMLElement | null = null;
let touchHoldTimer: ReturnType<typeof setTimeout> | null = null;
let justDragged = false;
let justDraggedTimer: ReturnType<typeof setTimeout> | null = null;

function resolveSingleInput(
  r: HTMLInputElement | HTMLInputElement[] | null
): HTMLInputElement | null {
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

function setItemRef(idx: number, el: Element | ComponentPublicInstance | null) {
  itemRefs.value[idx] = el instanceof HTMLLIElement ? el : null;
}

watch(
  () => props.editingTaskId,
  (nextId) => {
    if (!nextId) return;
    const match = props.nodes.find((n) => n.task.id === nextId);
    if (!match) return;
    cancelInlineTitleEdit = false;
    isInlineTitleCommitting = false;
    inlineTitleDraft.value = match.task.name;
    nextTick(() => {
      const input = resolveSingleInput(inlineTitleInputRef.value);
      if (input) {
        input.focus();
        input.select();
      }
    });
  },
  { immediate: true }
);

watch(
  () => props.addingSubtaskForId,
  (nextId) => {
    if (!nextId) return;
    const match = props.nodes.find((n) => n.task.id === nextId);
    if (!match) return;
    isSubtaskCommitting = false;
    inlineSubtaskDraft.value = '';
    nextTick(() => {
      resolveSingleInput(subtaskInputRef.value)?.focus();
    });
  },
  { immediate: true }
);

function announceMove(taskName: string, pos: number, total: number) {
  if (announceTimer) clearTimeout(announceTimer);
  liveAnnouncement.value = '';
  announceTimer = setTimeout(() => {
    liveAnnouncement.value = t('tasks.reorderedAnnouncement', {
      name: taskName,
      position: pos + 1,
      total,
    });
  }, 120);
}

function clearPendingDragState() {
  if (touchHoldTimer) {
    clearTimeout(touchHoldTimer);
    touchHoldTimer = null;
  }
  pendingTaskId = null;
  pendingIdx = -1;
  pendingPointerId = null;
  pendingCapturedEl = null;
}

function cleanupWindowPointerListeners() {
  if (import.meta.server) return;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  window.removeEventListener('keydown', onDragEscape, true);
}

onBeforeUnmount(() => {
  if (announceTimer) clearTimeout(announceTimer);
  if (justDraggedTimer) clearTimeout(justDraggedTimer);
  clearPendingDragState();
  cleanupWindowPointerListeners();
});

function computeDropGapFromClientY(clientY: number): number {
  const container = listRef.value;
  if (!container) return dragStartIndex.value;

  const containerRect = container.getBoundingClientRect();
  const clampedClientY = Math.max(containerRect.top, Math.min(clientY, containerRect.bottom));

  for (let i = 0; i < props.nodes.length; i++) {
    const li = itemRefs.value[i];
    if (!li) continue;
    const rect = li.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clampedClientY < midpoint) {
      return i;
    }
  }
  return props.nodes.length;
}

function activateDragNow(clientY: number) {
  if (!pendingTaskId || pendingIdx === -1 || pendingPointerId === null) return;
  draggingTaskId.value = pendingTaskId;
  activePointerId.value = pendingPointerId;
  dragStartIndex.value = pendingIdx;
  pendingStartY = clientY;
  dragOffsetY.value = 0;
  dropGapIndex.value = pendingIdx;
  try {
    pendingCapturedEl?.setPointerCapture?.(pendingPointerId);
  } catch {
    // Ignore environments where pointer capture is unavailable
  }
}

function onPointerMove(event: PointerEvent) {
  if (draggingTaskId.value && event.pointerId === activePointerId.value) {
    dragOffsetY.value = event.clientY - pendingStartY;
    dropGapIndex.value = computeDropGapFromClientY(event.clientY);
    return;
  }

  if (pendingTaskId && event.pointerId === pendingPointerId) {
    const dx = Math.abs(event.clientX - pendingStartX);
    const dy = Math.abs(event.clientY - pendingStartY);

    if (pendingPointerType === 'touch') {
      // Allow native vertical scrolling if the user moves their finger before long-press fires
      if (dx > 8 || dy > 8) {
        clearPendingDragState();
        cleanupWindowPointerListeners();
      }
    } else if (dy >= 6 || dx >= 10) {
      activateDragNow(pendingStartY);
      if (draggingTaskId.value) {
        dragOffsetY.value = event.clientY - pendingStartY;
        dropGapIndex.value = computeDropGapFromClientY(event.clientY);
      }
    }
  }
}

function finishPointerDrag(commit: boolean) {
  const movedId = draggingTaskId.value;
  const fromIdx = dragStartIndex.value;
  const gapIdx = dropGapIndex.value;

  const hadActiveDrag = Boolean(movedId);
  clearPendingDragState();
  draggingTaskId.value = null;
  activePointerId.value = null;
  dropGapIndex.value = null;
  dragOffsetY.value = 0;
  dragStartIndex.value = -1;
  cleanupWindowPointerListeners();

  if (hadActiveDrag) {
    justDragged = true;
    if (justDraggedTimer) clearTimeout(justDraggedTimer);
    justDraggedTimer = setTimeout(() => {
      justDragged = false;
    }, 80);
  }

  if (!commit || !movedId || fromIdx === -1 || gapIdx === null) return;
  const targetIndex = gapIdx > fromIdx ? gapIdx - 1 : gapIdx;
  if (targetIndex !== fromIdx) {
    emit('reorder', { taskId: movedId, targetIndex });
    const movedNode = props.nodes[fromIdx];
    if (movedNode) {
      announceMove(movedNode.task.name, targetIndex, props.nodes.length);
    }
  }
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId.value && event.pointerId !== pendingPointerId) return;
  if (draggingTaskId.value) {
    finishPointerDrag(true);
  } else {
    clearPendingDragState();
    cleanupWindowPointerListeners();
  }
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== activePointerId.value && event.pointerId !== pendingPointerId) return;
  finishPointerDrag(false);
}

function onDragEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && (draggingTaskId.value || pendingTaskId)) {
    event.preventDefault();
    event.stopPropagation();
    finishPointerDrag(false);
  }
}

function handleRowPointerDown(event: PointerEvent, idx: number, taskId: EntityId) {
  if (props.editingTaskId === taskId) return;
  if (props.nodes.length <= 1) return;
  if (event.pointerType !== 'touch' && event.button !== 0) return;

  const targetEl = event.target as HTMLElement | null;
  if (targetEl?.closest('[data-no-row-drag], input, textarea, select, [role="menuitem"]')) {
    return;
  }

  clearPendingDragState();
  pendingTaskId = taskId;
  pendingIdx = idx;
  pendingPointerId = event.pointerId;
  pendingPointerType = event.pointerType;
  pendingStartX = event.clientX;
  pendingStartY = event.clientY;
  pendingCapturedEl = event.currentTarget as HTMLElement | null;

  if (event.pointerType === 'touch') {
    const startY = event.clientY;
    touchHoldTimer = setTimeout(() => {
      activateDragNow(startY);
    }, 220);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onDragEscape, true);
}

function handleRowClick(event: MouseEvent, node: TaskTreeNode) {
  if (justDragged || props.editingTaskId === node.task.id) return;
  const toggleOnly = props.multiSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey;
  emit('rowSelect', {
    taskId: node.task.id,
    shiftKey: event.shiftKey,
    ctrlOrMetaKey: event.ctrlKey || event.metaKey,
    toggleOnly,
  });
}

function handleRowDoubleClick(node: TaskTreeNode) {
  if (justDragged || props.editingTaskId === node.task.id) return;
  emit('openDetails', node.task.id);
}

function handleTitleClick(event: MouseEvent, node: TaskTreeNode) {
  if (justDragged) return;
  if (event.shiftKey || event.ctrlKey || event.metaKey || props.multiSelectMode) {
    emit('rowSelect', {
      taskId: node.task.id,
      shiftKey: event.shiftKey,
      ctrlOrMetaKey: event.ctrlKey || event.metaKey,
      toggleOnly: props.multiSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey,
    });
    return;
  }

  emit('rowSelect', {
    taskId: node.task.id,
    shiftKey: false,
    ctrlOrMetaKey: false,
  });
  emit('openDetails', node.task.id);
}

function handleRowKeydown(event: KeyboardEvent, idx: number, node: TaskTreeNode) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select')) return;

  // Alt + Up/Down reorders sibling priority
  if (event.altKey) {
    if (event.key === 'ArrowUp' && idx > 0) {
      event.preventDefault();
      event.stopPropagation();
      emit('reorder', { taskId: node.task.id, targetIndex: idx - 1 });
      announceMove(node.task.name, idx - 1, props.nodes.length);
      return;
    }

    if (event.key === 'ArrowDown' && idx < props.nodes.length - 1) {
      event.preventDefault();
      event.stopPropagation();
      emit('reorder', { taskId: node.task.id, targetIndex: idx + 1 });
      announceMove(node.task.name, idx + 1, props.nodes.length);
      return;
    }
    return;
  }

  // Ctrl/Cmd + ] and Ctrl/Cmd + [ indent / promote (avoids browser Alt+Arrow history navigation)
  if ((event.ctrlKey || event.metaKey) && event.key === ']') {
    if (idx > 0 && props.depth < MAX_TASK_DEPTH) {
      event.preventDefault();
      event.stopPropagation();
      emit('reparent', {
        taskId: node.task.id,
        newParentTaskId: props.nodes[idx - 1]!.task.id,
      });
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '[') {
    if (props.depth > 0) {
      event.preventDefault();
      event.stopPropagation();
      emit('reparent', {
        taskId: node.task.id,
        newParentTaskId: props.parentParentTaskId ?? null,
      });
    }
    return;
  }

  // Expand / collapse branches with Left / Right arrow keys
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.key === 'ArrowLeft' && node.children.length > 0 && !props.collapsedTaskIds.has(node.task.id)) {
      event.preventDefault();
      event.stopPropagation();
      emit('toggleCollapse', node.task.id);
      return;
    }
    if (event.key === 'ArrowRight' && node.children.length > 0 && props.collapsedTaskIds.has(node.task.id)) {
      event.preventDefault();
      event.stopPropagation();
      emit('toggleCollapse', node.task.id);
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      emit('startInlineRename', node.task.id);
      return;
    }
  }

  // Shift+Enter creates a child subtask directly from any selected/focused row
  if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    if (props.depth < MAX_TASK_DEPTH) {
      event.preventDefault();
      event.stopPropagation();
      emit('openSubtaskComposer', node.task.id);
    }
  }
}

// Inline Title Rename Handlers
function submitInlineTitle(
  node: TaskTreeNode,
  opts?: { addSubtaskAfter?: boolean; reparentTarget?: EntityId | null }
) {
  if (cancelInlineTitleEdit || isInlineTitleCommitting) return;
  isInlineTitleCommitting = true;
  const trimmed = inlineTitleDraft.value.trim();
  emit('commitInlineRename', {
    taskId: node.task.id,
    name: trimmed || node.task.name,
    addSubtaskAfter: opts?.addSubtaskAfter,
    reparentTarget: opts?.reparentTarget,
  });
}

function handleInlineTitleKeydown(event: KeyboardEvent, idx: number, node: TaskTreeNode) {
  if (event.isComposing || event.keyCode === 229) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    submitInlineTitle(node, {
      addSubtaskAfter: event.shiftKey && props.depth < MAX_TASK_DEPTH,
    });
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      if (props.depth > 0) {
        submitInlineTitle(node, { reparentTarget: props.parentParentTaskId ?? null });
      }
    } else if (idx > 0 && props.depth < MAX_TASK_DEPTH) {
      submitInlineTitle(node, { reparentTarget: props.nodes[idx - 1]!.task.id });
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cancelInlineTitleEdit = true;
    emit('startInlineRename', null);
  }
}

function handleInlineTitleBlur(node: TaskTreeNode) {
  if (cancelInlineTitleEdit || isInlineTitleCommitting) {
    cancelInlineTitleEdit = false;
    return;
  }
  submitInlineTitle(node);
}

// Inline Subtask Composer Handlers
function commitInlineSubtask(parentId: EntityId, keepOpen: boolean, addChildAfter = false) {
  if (isSubtaskCommitting) return;
  const name = inlineSubtaskDraft.value.trim();
  if (!name) {
    if (!keepOpen && !addChildAfter) emit('openSubtaskComposer', null);
    return;
  }
  isSubtaskCommitting = true;
  inlineSubtaskDraft.value = '';
  if (!keepOpen && !addChildAfter) {
    emit('openSubtaskComposer', null);
  }
  emit('createSubtask', { parentTaskId: parentId, name, addChildAfter });
  nextTick(() => {
    isSubtaskCommitting = false;
    if (keepOpen && !addChildAfter) {
      resolveSingleInput(subtaskInputRef.value)?.focus();
    }
  });
}

function handleSubtaskKeydown(event: KeyboardEvent, parentId: EntityId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    const nestUnderCreated = event.shiftKey && props.depth === 0;
    commitInlineSubtask(parentId, !nestUnderCreated, nestUnderCreated);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    inlineSubtaskDraft.value = '';
    emit('openSubtaskComposer', null);
  }
}

function isLevel2RolledUp(node: TaskTreeNode): boolean {
  return (
    props.depth >= MAX_TASK_DEPTH &&
    !node.task.externalWorkItemId &&
    Boolean(props.inheritedAdoTask?.externalWorkItemId)
  );
}

function effectiveExternalUrl(node: TaskTreeNode): string | null {
  if (node.task.externalWorkItemUrl) return node.task.externalWorkItemUrl;
  if (isLevel2RolledUp(node)) return props.inheritedAdoTask?.externalWorkItemUrl ?? null;
  return null;
}

function dueBadgeClass(task: Task): string {
  if (!task.dueDate) return '';
  const tone = classifyDueDateTone(task.dueDate, todayDateKey.value, task.status);
  if (tone === 'overdue') return 'border-rose-500/40 bg-rose-500/10 text-rose-500';
  if (tone === 'today') return 'border-amber-500/40 bg-amber-500/10 text-amber-500';
  return 'border-border-hairline bg-bg-elevated text-text-muted';
}

function effectiveCompletedWorkFor(node: TaskTreeNode): number {
  return props.effectiveCompletedHoursByTask.get(node.task.id) ?? node.task.completedWorkHours ?? 0;
}

function getTimerEligibility(taskId: EntityId): TaskTimerEligibility {
  return props.timerEligibilityByTask.get(taskId) ?? { allowed: true, reason: null };
}

function startTimerHint(node: TaskTreeNode): string {
  const elig = getTimerEligibility(node.task.id);
  if (!elig.allowed) {
    return elig.reason === 'PARENT_HAS_SUBTASKS'
      ? t('tasks.timerBlockedParentHint')
      : t('tasks.timerBlockedUnsupportedAdoHint');
  }
  return t('catalog.startTaskTimer');
}

function hasMetadataRow(node: TaskTreeNode): boolean {
  const taskItem = node.task;
  return Boolean(
    taskItem.externalWorkItemId ||
      isLevel2RolledUp(node) ||
      (taskItem.tagIds?.length ?? 0) > 0 ||
      taskItem.dueDate ||
      taskItem.description ||
      (props.trackedSecondsByTask.get(taskItem.id) ?? 0) > 0 ||
      (props.unsyncedHoursByTask.get(taskItem.id) ?? 0) > 0 ||
      effectiveCompletedWorkFor(node) > 0
  );
}
</script>

<template>
  <ul
    ref="listRef"
    :role="depth === 0 ? 'tree' : 'group'"
    :aria-multiselectable="depth === 0 ? 'true' : undefined"
    :data-task-depth="depth"
    :class="
      depth === 0
        ? 'divide-y divide-border-hairline border border-border-hairline bg-bg-primary'
        : 'divide-y divide-border-hairline'
    "
  >
    <li
      v-for="(node, idx) in nodes"
      :key="node.task.id"
      :ref="(el) => setItemRef(idx, el)"
      :data-testid="`task-row-${node.task.id}`"
      class="group/row relative transition-colors"
      :class="[
        draggingTaskId === node.task.id
          ? 'z-20 bg-bg-elevated shadow-2xl ring-1 ring-signal select-none'
          : selectedTaskIds.has(node.task.id)
            ? 'bg-signal-soft/65 shadow-[inset_3px_0_0_var(--signal)]'
            : 'hover:bg-bg-hover/35',
      ]"
      :style="
        draggingTaskId === node.task.id && dragOffsetY !== 0
          ? { transform: `translateY(${dragOffsetY}px)` }
          : undefined
      "
    >
      <!-- Top Drop Target Signal Line -->
      <div
        v-if="draggingTaskId && dropGapIndex === idx && dragStartIndex !== idx && dragStartIndex + 1 !== idx"
        class="pointer-events-none absolute inset-x-0 top-0 z-30 h-[2px] bg-signal"
        aria-hidden="true"
      />
      <!-- Bottom Drop Target Signal Line -->
      <div
        v-if="draggingTaskId && idx === nodes.length - 1 && dropGapIndex === nodes.length && dragStartIndex !== nodes.length - 1"
        class="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[2px] bg-signal"
        aria-hidden="true"
      />

      <!-- Right-Click / Menu-Key Azure DevOps-Style Context Menu Wrapper -->
      <TasksTaskRowContextMenu
        :task-name="node.task.name"
        :depth="depth"
        :selected="selectedTaskIds.has(node.task.id)"
        :selected-count="selectedCount"
        :can-add-subtask="depth < MAX_TASK_DEPTH"
        :can-indent="idx > 0 && depth < MAX_TASK_DEPTH"
        :can-outdent="depth > 0"
        :external-url="effectiveExternalUrl(node)"
        @prepare-context-menu="emit('prepareContextMenu', node.task.id)"
        @open-details="emit('openDetails', node.task.id)"
        @rename-inline="emit('startInlineRename', node.task.id)"
        @add-subtask="emit('openSubtaskComposer', node.task.id)"
        @duplicate="emit('duplicateTasks', node.task.id)"
        @indent="
          idx > 0 && depth < MAX_TASK_DEPTH
            ? emit('reparent', {
                taskId: node.task.id,
                newParentTaskId: nodes[idx - 1]!.task.id,
              })
            : undefined
        "
        @outdent="
          depth > 0
            ? emit('reparent', {
                taskId: node.task.id,
                newParentTaskId: parentParentTaskId ?? null,
              })
            : undefined
        "
        @export-markdown="emit('exportMarkdown', node.task.id)"
        @export-csv="emit('exportCsv', node.task.id)"
        @bulk-update-tags="emit('bulkUpdateTags')"
        @bulk-mark-done="emit('bulkMarkStatus', 'done')"
        @bulk-mark-todo="emit('bulkMarkStatus', 'todo')"
        @delete="emit('deleteTask', node.task)"
        @bulk-delete="emit('bulkDelete')"
      >
        <!-- Interactive Row Container -->
        <div
          role="treeitem"
          :tabindex="focusedTaskId === node.task.id ? 0 : -1"
          :data-task-focus-id="node.task.id"
          :aria-selected="selectedTaskIds.has(node.task.id)"
          :aria-expanded="node.children.length > 0 ? !collapsedTaskIds.has(node.task.id) : undefined"
          :aria-level="depth + 1"
          class="flex items-start justify-between gap-2 py-2.5 pl-2.5 sm:pl-3.5 pr-2.5 sm:pr-3.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal"
          :class="[
            draggingTaskId === node.task.id ? 'cursor-grabbing' : nodes.length > 1 ? 'cursor-grab' : '',
          ]"
          :style="{ touchAction: draggingTaskId === node.task.id ? 'none' : 'pan-y' }"
          @pointerdown="handleRowPointerDown($event, idx, node.task.id)"
          @click="handleRowClick($event, node)"
          @dblclick.stop="handleRowDoubleClick(node)"
          @keydown="handleRowKeydown($event, idx, node)"
        >
          <!-- Left Expand/Collapse Chevron + Completion Checkbox + Content -->
          <div class="flex items-start gap-2 min-w-0 flex-1">
            <!-- Expand/Collapse Chevron -->
            <button
              v-if="node.children.length > 0"
              type="button"
              data-no-row-drag
              :data-testid="`task-collapse-btn-${node.task.id}`"
              :aria-expanded="!collapsedTaskIds.has(node.task.id)"
              :aria-label="
                collapsedTaskIds.has(node.task.id)
                  ? $t('tasks.expandTaskAria', { name: node.task.name })
                  : $t('tasks.collapseTaskAria', { name: node.task.name })
              "
              class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-text-muted hover:text-signal transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal"
              @pointerdown.stop
              @click.stop="emit('toggleCollapse', node.task.id)"
            >
              <ChevronRight
                v-if="collapsedTaskIds.has(node.task.id)"
                class="h-4 w-4"
                aria-hidden="true"
              />
              <ChevronDown
                v-else
                class="h-4 w-4"
                aria-hidden="true"
              />
            </button>
            <span
              v-else-if="hasAnyExpandableHere"
              class="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />

            <!-- Completion Status Circle -->
            <button
              type="button"
              data-no-row-drag
              :aria-label="
                node.task.status === 'done'
                  ? $t('tasks.markTodoAria', { name: node.task.name })
                  : $t('tasks.markDoneAria', { name: node.task.name })
              "
              :aria-pressed="node.task.status === 'done'"
              class="mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              :class="{
                'border-text-muted/60 hover:border-signal': node.task.status === 'todo',
                'border-signal bg-signal-soft text-signal': node.task.status === 'in_progress',
                'border-emerald-500 bg-emerald-500 text-white': node.task.status === 'done',
              }"
              @pointerdown.stop
              @click.stop="emit('toggleDone', { taskId: node.task.id, current: node.task.status })"
            >
              <Check v-if="node.task.status === 'done'" class="h-3 w-3 stroke-[3]" aria-hidden="true" />
              <span
                v-else-if="node.task.status === 'in_progress'"
                class="h-2 w-2 rounded-full bg-signal motion-safe:animate-pulse"
                aria-hidden="true"
              />
            </button>

            <div class="min-w-0 flex-1">
              <!-- Inline Title Editor -->
              <input
                v-if="editingTaskId === node.task.id"
                ref="inlineTitleInputRef"
                v-model="inlineTitleDraft"
                type="text"
                maxlength="200"
                data-no-row-drag
                :data-testid="`task-inline-title-input-${node.task.id}`"
                :aria-label="$t('tasks.editTaskAria', { name: node.task.name })"
                class="h-7 w-full border-b border-signal bg-bg-elevated px-1.5 text-ui font-medium text-text-primary focus:outline-none"
                @pointerdown.stop
                @click.stop
                @keydown="handleInlineTitleKeydown($event, idx, node)"
                @blur="handleInlineTitleBlur(node)"
              />

              <!-- Title Button (Opens Details or Enters Inline Edit When Already Selected) -->
              <div v-else class="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  :data-testid="`task-title-btn-${node.task.id}`"
                  :title="node.task.name"
                  class="min-w-0 max-w-full text-left text-ui font-medium leading-snug line-clamp-2 sm:truncate transition-colors hover:text-signal focus-visible:outline-none focus-visible:text-signal"
                  :class="
                    node.task.status === 'done'
                      ? 'line-through text-text-muted'
                      : 'text-text-primary'
                  "
                  @click.stop="handleTitleClick($event, node)"
                >
                  {{ node.task.name }}
                </button>

                <button
                  v-if="node.children.length > 0 && collapsedTaskIds.has(node.task.id)"
                  type="button"
                  data-no-row-drag
                  class="tabular-telemetry shrink-0 border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
                  @pointerdown.stop
                  @click.stop="emit('toggleCollapse', node.task.id)"
                >
                  +{{ node.children.length }}
                </button>
              </div>

              <!-- Compact Metadata Sub-Line (ADO Badge, Interactive Tags, Deadline, Desc, Tracked Hours) -->
              <div
                v-if="hasMetadataRow(node)"
                class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-muted"
              >
                <template v-if="node.task.externalWorkItemId">
                  <span data-no-row-drag @pointerdown.stop @click.stop>
                    <AdoWorkItemTypeBadge
                      compact
                      :work-item-type="node.task.externalWorkItemType"
                      :work-item-id="node.task.externalWorkItemId"
                      :work-item-title="node.task.externalWorkItemTitle"
                      :url="node.task.externalWorkItemUrl"
                    />
                  </span>
                  <span
                    v-if="effectiveCompletedWorkFor(node) > 0"
                    class="tabular-telemetry hidden sm:inline text-xs text-text-muted"
                    :title="node.children.length > 0 ? $t('tasks.completedWorkRolledUpHint') : undefined"
                  >
                    {{ node.children.length > 0 ? '∑ ' : '' }}{{ effectiveCompletedWorkFor(node).toFixed(2) }}h
                  </span>
                  <span
                    v-if="(unsyncedHoursByTask.get(node.task.id) ?? 0) > 0"
                    class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-500"
                  >
                    +{{ (unsyncedHoursByTask.get(node.task.id) ?? 0).toFixed(2) }}h
                  </span>
                </template>

                <span
                  v-else-if="isLevel2RolledUp(node)"
                  class="tabular-telemetry inline-flex items-center gap-1 border border-signal/30 bg-signal-soft/50 px-1.5 py-0.5 text-xs font-medium text-signal"
                  :title="$t('tasks.rollsUpToAdoHint', { id: inheritedAdoTask!.externalWorkItemId, type: inheritedAdoTask!.externalWorkItemType || 'Task' })"
                >
                  <span>↳ ∑ #{{ inheritedAdoTask!.externalWorkItemId }}</span>
                </span>

                <span
                  v-else-if="node.children.length > 0 && effectiveCompletedWorkFor(node) > 0"
                  class="tabular-telemetry inline-flex items-center gap-1 border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted"
                  :title="$t('tasks.completedWorkRolledUpHint')"
                >
                  ∑ {{ effectiveCompletedWorkFor(node).toFixed(2) }}h
                </span>

                <!-- 1-Click Editable Inline Project-Scoped Tags (when tags attached) -->
                <span
                  v-if="(node.task.tagIds?.length ?? 0) > 0"
                  data-no-row-drag
                  @pointerdown.stop
                  @click.stop
                >
                  <UiTagMultiSelect
                    :model-value="node.task.tagIds ?? []"
                    :tags="projectTags"
                    :project-id="node.task.projectId"
                    :allow-create="true"
                    variant="row"
                    :stop-propagation="true"
                    :test-id="`task-row-tags-${node.task.id}`"
                    @update:model-value="emit('updateTags', { taskId: node.task.id, tagIds: $event })"
                  />
                </span>

                <!-- Deadline Pill -->
                <button
                  v-if="node.task.dueDate"
                  type="button"
                  data-no-row-drag
                  :class="dueBadgeClass(node.task)"
                  class="tabular-telemetry inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs font-medium hover:border-signal transition-colors"
                  :title="$t('tasks.deadline.label')"
                  @pointerdown.stop
                  @click.stop="emit('openDetails', node.task.id)"
                >
                  <Calendar class="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{{ formatDateKey(node.task.dueDate) }}</span>
                </button>

                <!-- Markdown Description Indicator -->
                <AlignLeft
                  v-if="node.task.description"
                  class="h-3 w-3 shrink-0 text-text-faint"
                  :aria-label="$t('tasks.detailModal.descriptionLabel')"
                />

                <!-- Rolled-up Tracked Telemetry -->
                <span
                  v-if="(trackedSecondsByTask.get(node.task.id) ?? 0) > 0"
                  class="tabular-telemetry text-xs text-text-muted"
                  :title="$t('tasks.trackedTotalHint')"
                >
                  {{ formatHMS(trackedSecondsByTask.get(node.task.id) ?? 0) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Right-Side Inline Action Controls: [Tag ghost] [▶ / ■ HH:MM:SS] [⋮] -->
          <div class="flex items-center gap-0.5 shrink-0">
            <span
              v-if="(node.task.tagIds?.length ?? 0) === 0"
              data-no-row-drag
              @pointerdown.stop
              @click.stop
            >
              <UiTagMultiSelect
                :model-value="[]"
                :tags="projectTags"
                :project-id="node.task.projectId"
                :allow-create="true"
                variant="row"
                :stop-propagation="true"
                :test-id="`task-row-add-tag-${node.task.id}`"
                @update:model-value="emit('updateTags', { taskId: node.task.id, tagIds: $event })"
              />
            </span>

            <button
              v-if="runningTaskId === node.task.id"
              type="button"
              data-no-row-drag
              data-testid="task-row-stop-timer"
              :aria-label="$t('tasks.stopTimerAria', { name: node.task.name })"
              :title="$t('tasks.stopTimerAria', { name: node.task.name })"
              class="btn-press tabular-telemetry inline-flex h-8 shrink-0 items-center gap-1.5 border border-signal bg-signal-soft px-2.5 text-xs font-semibold text-signal hover:bg-signal hover:text-white transition-colors"
              @mousedown.prevent
              @pointerdown.stop
              @click.stop="emit('stopTimer')"
            >
              <Square class="h-3 w-3 fill-current" aria-hidden="true" />
              <span>{{ formatHMS(runningElapsedSeconds) }}</span>
            </button>

            <button
              v-else
              type="button"
              data-no-row-drag
              data-testid="task-row-start-timer"
              :disabled="!getTimerEligibility(node.task.id).allowed"
              :aria-label="
                getTimerEligibility(node.task.id).allowed
                  ? $t('tasks.startTimerAria', { name: node.task.name })
                  : startTimerHint(node)
              "
              :title="startTimerHint(node)"
              :class="
                getTimerEligibility(node.task.id).allowed
                  ? 'row-action-ghost hover:border-signal/60 hover:text-signal'
                  : 'inline-flex h-8 w-8 shrink-0 items-center justify-center border border-transparent text-text-faint opacity-35 cursor-not-allowed'
              "
              @mousedown.prevent
              @pointerdown.stop
              @click.stop="getTimerEligibility(node.task.id).allowed && emit('startTimer', node.task.id)"
            >
              <Play class="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <TasksTaskRowActionsMenu
              :task-name="node.task.name"
              :depth="depth"
              :selected="selectedTaskIds.has(node.task.id)"
              :selected-count="selectedCount"
              :can-add-subtask="depth < MAX_TASK_DEPTH"
              :can-indent="idx > 0 && depth < MAX_TASK_DEPTH"
              :can-outdent="depth > 0"
              :external-url="effectiveExternalUrl(node)"
              @open-details="emit('openDetails', node.task.id)"
              @rename-inline="emit('startInlineRename', node.task.id)"
              @add-subtask="emit('openSubtaskComposer', node.task.id)"
              @duplicate="emit('duplicateTasks', node.task.id)"
              @indent="
                idx > 0 && depth < MAX_TASK_DEPTH
                  ? emit('reparent', {
                      taskId: node.task.id,
                      newParentTaskId: nodes[idx - 1]!.task.id,
                    })
                  : undefined
              "
              @outdent="
                depth > 0
                  ? emit('reparent', {
                      taskId: node.task.id,
                      newParentTaskId: parentParentTaskId ?? null,
                    })
                  : undefined
              "
              @export-markdown="emit('exportMarkdown', node.task.id)"
              @export-csv="emit('exportCsv', node.task.id)"
              @bulk-update-tags="emit('bulkUpdateTags')"
              @bulk-mark-done="emit('bulkMarkStatus', 'done')"
              @bulk-mark-todo="emit('bulkMarkStatus', 'todo')"
              @delete="emit('deleteTask', node.task)"
              @bulk-delete="emit('bulkDelete')"
            />
          </div>
        </div>
      </TasksTaskRowContextMenu>

      <!-- Inline Subtask Composer Right Beneath Parent Task -->
      <div
        v-if="addingSubtaskForId === node.task.id"
        class="flex items-center gap-2 border-t border-border-hairline bg-bg-elevated/70 py-2 pl-6 sm:pl-9 pr-3.5"
      >
        <CornerDownRight class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
        <input
          ref="subtaskInputRef"
          v-model="inlineSubtaskDraft"
          type="text"
          maxlength="200"
          enterkeyhint="done"
          :data-testid="`inline-subtask-input-${node.task.id}`"
          :placeholder="
            depth === 0
              ? $t('tasks.inlineSubtaskPlaceholder')
              : $t('tasks.inlineSubSubtaskPlaceholder')
          "
          class="h-8 flex-1 border-b border-signal bg-transparent px-1.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
          @keydown="handleSubtaskKeydown($event, node.task.id)"
          @blur="commitInlineSubtask(node.task.id, false)"
        />
      </div>

      <!-- Recursive Child Subtasks / Sub-subtasks (Stepped Left-Rail Indentation) -->
      <div
        v-if="node.children.length > 0 && !collapsedTaskIds.has(node.task.id)"
        class="border-t border-border-hairline bg-bg-elevated/25 ml-5 sm:ml-8 border-l-2"
        :class="depth === 0 ? 'border-l-signal/40' : 'border-l-border-hairline'"
      >
        <TasksTaskTreeLevel
          :nodes="node.children"
          :depth="depth + 1"
          :parent-parent-task-id="node.task.parentTaskId ?? null"
          :inherited-ado-task="node.task.externalWorkItemId ? node.task : inheritedAdoTask"
          :running-task-id="runningTaskId"
          :running-elapsed-seconds="runningElapsedSeconds"
          :tracked-seconds-by-task="trackedSecondsByTask"
          :unsynced-hours-by-task="unsyncedHoursByTask"
          :effective-completed-hours-by-task="effectiveCompletedHoursByTask"
          :timer-eligibility-by-task="timerEligibilityByTask"
          :project-tags="projectTags"
          :selected-task-ids="selectedTaskIds"
          :selected-count="selectedCount"
          :focused-task-id="focusedTaskId"
          :multi-select-mode="multiSelectMode"
          :collapsed-task-ids="collapsedTaskIds"
          :editing-task-id="editingTaskId"
          :adding-subtask-for-id="addingSubtaskForId"
          @reorder="emit('reorder', $event)"
          @reparent="emit('reparent', $event)"
          @create-subtask="emit('createSubtask', $event)"
          @open-subtask-composer="emit('openSubtaskComposer', $event)"
          @start-inline-rename="emit('startInlineRename', $event)"
          @commit-inline-rename="emit('commitInlineRename', $event)"
          @update-tags="emit('updateTags', $event)"
          @start-timer="emit('startTimer', $event)"
          @stop-timer="emit('stopTimer')"
          @toggle-done="emit('toggleDone', $event)"
          @delete-task="emit('deleteTask', $event)"
          @bulk-delete="emit('bulkDelete')"
          @bulk-update-tags="emit('bulkUpdateTags')"
          @bulk-mark-status="emit('bulkMarkStatus', $event)"
          @duplicate-tasks="emit('duplicateTasks', $event)"
          @export-markdown="emit('exportMarkdown', $event)"
          @export-csv="emit('exportCsv', $event)"
          @toggle-collapse="emit('toggleCollapse', $event)"
          @open-details="emit('openDetails', $event)"
          @prepare-context-menu="emit('prepareContextMenu', $event)"
          @row-select="emit('rowSelect', $event)"
        />
      </div>
    </li>

    <li aria-live="polite" class="sr-only">
      {{ liveAnnouncement }}
    </li>
  </ul>
</template>
