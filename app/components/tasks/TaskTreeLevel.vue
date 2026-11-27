<script setup lang="ts">
import {
  Check,
  CornerDownRight,
  ExternalLink,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next';
import type { AdoSelectedWorkItem } from '~/components/ado/AdoWorkItemPickerPopover.vue';
import { MAX_TASK_DEPTH, type TaskTreeNode } from '~/domain/invariants';
import { formatHMS } from '~/domain/duration';
import { renderBasicMarkdown } from '~/domain/markdown';
import type { EntityId, Task, TaskStatus } from '~/domain/types';

const props = withDefaults(
  defineProps<{
    nodes: readonly TaskTreeNode[];
    depth?: number;
    runningTaskId?: EntityId | null;
    trackedSecondsByTask?: ReadonlyMap<EntityId, number>;
    unsyncedHoursByTask?: ReadonlyMap<EntityId, number>;
    adoConnected?: boolean;
    adoOrgUrl?: string;
    adoProject?: string;
    adoEnabledForProject?: boolean;
  }>(),
  {
    depth: 0,
    runningTaskId: null,
    trackedSecondsByTask: () => new Map(),
    unsyncedHoursByTask: () => new Map(),
    adoConnected: false,
    adoOrgUrl: undefined,
    adoProject: undefined,
    adoEnabledForProject: false,
  }
);

const emit = defineEmits<{
  reorder: [payload: { taskId: EntityId; targetIndex: number }];
  startTimer: [taskId: EntityId];
  cycleStatus: [payload: { taskId: EntityId; current: TaskStatus }];
  prefillSubtask: [parentId: EntityId];
  deleteTask: [task: Task];
  saveEdit: [
    payload: {
      taskId: EntityId;
      name: string;
      description: string;
      targetHours: number | null;
      adoItem?: AdoSelectedWorkItem | null;
    },
  ];
  linkAdo: [payload: { task: Task; adoItem: AdoSelectedWorkItem | null }];
  createAdo: [task: Task];
}>();

const { t } = useI18n();

// Inline Task Editor state
const editingTaskId = ref<EntityId | null>(null);
const editName = ref('');
const editDescription = ref('');
const editTargetHours = ref('');

// Pointer Drag-and-Drop Reorder state (strictly scoped to direct siblings in this list)
const listRef = ref<HTMLUListElement | null>(null);
const itemRefs = ref<Array<HTMLLIElement | null>>([]);
const handleRefs = ref<Array<HTMLButtonElement | null>>([]);

const draggingTaskId = ref<EntityId | null>(null);
const activePointerId = ref<number | null>(null);
const dropGapIndex = ref<number | null>(null);
const dragOffsetY = ref(0);
const pointerStartY = ref(0);
const dragStartIndex = ref(-1);
const liveAnnouncement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | null = null;

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

onBeforeUnmount(() => {
  if (announceTimer) clearTimeout(announceTimer);
  cleanupWindowPointerListeners();
});

function setItemRef(idx: number, el: Element | ComponentPublicInstance | null) {
  itemRefs.value[idx] = el instanceof HTMLLIElement ? el : null;
}

function setHandleRef(idx: number, el: Element | ComponentPublicInstance | null) {
  handleRefs.value[idx] = el instanceof HTMLButtonElement ? el : null;
}

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

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId.value || !draggingTaskId.value) return;
  dragOffsetY.value = event.clientY - pointerStartY.value;
  dropGapIndex.value = computeDropGapFromClientY(event.clientY);
}

function finishPointerDrag(commit: boolean) {
  const movedId = draggingTaskId.value;
  const fromIdx = dragStartIndex.value;
  const gapIdx = dropGapIndex.value;

  draggingTaskId.value = null;
  activePointerId.value = null;
  dropGapIndex.value = null;
  dragOffsetY.value = 0;
  dragStartIndex.value = -1;
  cleanupWindowPointerListeners();

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
  if (event.pointerId !== activePointerId.value) return;
  finishPointerDrag(true);
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== activePointerId.value) return;
  finishPointerDrag(false);
}

function onDragEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && draggingTaskId.value) {
    event.preventDefault();
    event.stopPropagation();
    finishPointerDrag(false);
  }
}

function cleanupWindowPointerListeners() {
  if (import.meta.server) return;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  window.removeEventListener('keydown', onDragEscape, true);
}

function handleDragPointerDown(event: PointerEvent, idx: number, taskId: EntityId) {
  if (event.button !== 0 || props.nodes.length <= 1) return;
  event.stopPropagation();
  event.preventDefault();

  activePointerId.value = event.pointerId;
  draggingTaskId.value = taskId;
  dragStartIndex.value = idx;
  pointerStartY.value = event.clientY;
  dragOffsetY.value = 0;
  dropGapIndex.value = idx;

  const targetEl = event.currentTarget as HTMLElement | null;
  targetEl?.setPointerCapture?.(event.pointerId);

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onDragEscape, true);
}

function handleHandleKeydown(event: KeyboardEvent, idx: number, node: TaskTreeNode) {
  if (!event.altKey) return;
  let targetIndex = -1;
  if (event.key === 'ArrowUp' && idx > 0) {
    targetIndex = idx - 1;
  } else if (event.key === 'ArrowDown' && idx < props.nodes.length - 1) {
    targetIndex = idx + 1;
  }
  if (targetIndex === -1) return;

  event.preventDefault();
  event.stopPropagation();
  emit('reorder', { taskId: node.task.id, targetIndex });
  announceMove(node.task.name, targetIndex, props.nodes.length);

  nextTick(() => {
    const newIdx = props.nodes.findIndex((n) => n.task.id === node.task.id);
    const li = itemRefs.value[newIdx >= 0 ? newIdx : targetIndex];
    const handle = handleRefs.value[newIdx >= 0 ? newIdx : targetIndex];
    li?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    handle?.focus({ preventScroll: true });
  });
}

function startEditTask(task: Task) {
  editingTaskId.value = task.id;
  editName.value = task.name;
  editDescription.value = task.description ?? '';
  editTargetHours.value = task.targetHours ? String(task.targetHours) : '';
}

function cancelEditTask() {
  editingTaskId.value = null;
}

function submitEditTask(taskId: EntityId) {
  if (!editName.value.trim()) return;
  const hrs = Number(editTargetHours.value);
  emit('saveEdit', {
    taskId,
    name: editName.value.trim(),
    description: editDescription.value,
    targetHours: Number.isFinite(hrs) && hrs > 0 ? hrs : null,
  });
  editingTaskId.value = null;
}
</script>

<template>
  <ul
    ref="listRef"
    :data-task-depth="depth"
    class="divide-y divide-border-hairline border border-border-hairline bg-bg-primary"
  >
    <li
      v-for="(node, idx) in nodes"
      :key="node.task.id"
      :ref="(el) => setItemRef(idx, el)"
      :data-testid="`task-row-${node.task.id}`"
      class="relative transition-colors"
      :class="[
        draggingTaskId === node.task.id ? 'z-20 bg-bg-elevated shadow-2xl ring-1 ring-signal' : 'hover:bg-bg-hover/35',
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
      <!-- Bottom Drop Target Signal Line (after last sibling) -->
      <div
        v-if="draggingTaskId && idx === nodes.length - 1 && dropGapIndex === nodes.length && dragStartIndex !== nodes.length - 1"
        class="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[2px] bg-signal"
        aria-hidden="true"
      />

      <div
        class="px-3.5 py-3 text-sm"
        :class="{
          'pl-6 sm:pl-8': depth === 1,
          'pl-10 sm:pl-14': depth === 2,
        }"
      >
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Dedicated Accessible Drag & Alt+Arrow Handle -->
            <button
              :ref="(el) => setHandleRef(idx, el)"
              type="button"
              :data-testid="`task-drag-handle-${node.task.id}`"
              :disabled="nodes.length <= 1"
              style="-webkit-user-select: none; user-select: none; touch-action: none"
              :aria-label="$t('tasks.dragHandleAria', { name: node.task.name })"
              :title="$t('tasks.dragHandleHint')"
              class="inline-flex h-7 w-6 shrink-0 items-center justify-center text-text-faint transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-30"
              :class="nodes.length > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'"
              @pointerdown="handleDragPointerDown($event, idx, node.task.id)"
              @keydown="handleHandleKeydown($event, idx, node)"
            >
              <GripVertical class="h-4 w-4" aria-hidden="true" />
            </button>

            <CornerDownRight
              v-if="depth > 0"
              class="h-3.5 w-3.5 shrink-0 text-text-muted"
              aria-hidden="true"
            />

            <button
              type="button"
              class="tabular-telemetry border px-2 py-0.5 text-xs font-medium uppercase shrink-0"
              :class="{
                'border-border-hairline text-text-muted': node.task.status === 'todo',
                'border-signal/40 bg-signal-soft text-signal': node.task.status === 'in_progress',
                'border-emerald-500/40 bg-emerald-500/10 text-emerald-500': node.task.status === 'done',
              }"
              @click="emit('cycleStatus', { taskId: node.task.id, current: node.task.status })"
            >
              {{
                node.task.status === 'todo'
                  ? $t('catalog.statusTodo')
                  : node.task.status === 'in_progress'
                    ? $t('catalog.statusInProgress')
                    : $t('catalog.statusDone')
              }}
            </button>

            <span class="truncate font-medium text-text-primary">
              {{ node.task.name }}
            </span>
          </div>

          <!-- Telemetry, ADO Linking & Actions -->
          <div class="flex flex-wrap items-center gap-2 shrink-0 text-xs text-text-muted">
            <span
              v-if="(trackedSecondsByTask.get(node.task.id) ?? 0) > 0"
              class="tabular-telemetry border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs text-text-primary"
              :title="$t('tasks.trackedTotalHint')"
            >
              {{ formatHMS(trackedSecondsByTask.get(node.task.id) ?? 0) }}
            </span>

            <span v-if="node.task.targetHours" class="tabular-telemetry text-xs text-text-muted">
              / {{ node.task.targetHours }}h
            </span>

            <!-- Azure DevOps Read-Only Title & CompletedWork Badge -->
            <template v-if="node.task.externalWorkItemId">
              <a
                v-if="node.task.externalWorkItemUrl"
                :href="node.task.externalWorkItemUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="tabular-telemetry inline-flex items-center gap-1.5 border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal hover:bg-accent hover:text-white transition-colors"
                :title="node.task.externalWorkItemTitle || `#${node.task.externalWorkItemId}`"
              >
                <span>#{{ node.task.externalWorkItemId }}</span>
                <span v-if="node.task.externalWorkItemTitle" class="hidden xl:inline max-w-[160px] truncate">
                  {{ node.task.externalWorkItemTitle }}
                </span>
                <span>· {{ (node.task.completedWorkHours || 0).toFixed(2) }}h</span>
                <ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              <span
                v-else
                class="tabular-telemetry border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs"
              >
                #{{ node.task.externalWorkItemId }} · {{ (node.task.completedWorkHours || 0).toFixed(2) }}h
              </span>

              <span
                v-if="(unsyncedHoursByTask.get(node.task.id) ?? 0) > 0"
                class="tabular-telemetry border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-500"
              >
                +{{ (unsyncedHoursByTask.get(node.task.id) ?? 0).toFixed(2) }}h
              </span>
            </template>

            <AdoWorkItemPickerPopover
              v-if="adoConnected"
              variant="pill"
              :work-item-id="node.task.externalWorkItemId"
              :work-item-title="node.task.externalWorkItemTitle"
              :org-url="adoOrgUrl"
              :project="adoProject"
              @select="emit('linkAdo', { task: node.task, adoItem: $event })"
            />

            <button
              v-if="adoConnected && adoEnabledForProject && !node.task.externalWorkItemId"
              type="button"
              class="btn-press inline-flex items-center gap-1 border border-border-hairline bg-bg-elevated px-2 py-1 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors"
              @click="emit('createAdo', node.task)"
            >
              <Plus class="h-3 w-3" aria-hidden="true" />
              <span>{{ $t('tasks.createInAdo') }}</span>
            </button>

            <button
              v-if="depth < MAX_TASK_DEPTH"
              type="button"
              class="btn-press border border-border-hairline bg-bg-elevated px-2.5 py-1 text-xs text-text-muted hover:border-signal hover:text-text-primary transition-colors"
              @click="emit('prefillSubtask', node.task.id)"
            >
              {{ depth === 0 ? $t('catalog.addSubtask') : $t('catalog.addSubSubtask') }}
            </button>

            <span
              v-if="runningTaskId === node.task.id"
              class="inline-flex items-center gap-1.5 border border-signal bg-signal-soft px-2.5 py-1 text-xs font-semibold text-signal"
            >
              <span class="h-1.5 w-1.5 bg-signal motion-safe:animate-pulse" />
              <span>{{ $t('catalog.runningTaskBadge') }}</span>
            </span>
            <button
              v-else
              type="button"
              class="btn-press inline-flex items-center gap-1.5 border border-signal/50 bg-signal-soft px-2.5 py-1 text-xs font-medium uppercase text-signal hover:bg-accent hover:text-white transition-colors"
              @click="emit('startTimer', node.task.id)"
            >
              <Play class="h-3 w-3 fill-current" aria-hidden="true" />
              <span>{{ $t('catalog.startTaskTimer') }}</span>
            </button>

            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center text-text-muted hover:text-signal transition-colors"
              :aria-label="$t('tasks.editTaskAria', { name: node.task.name })"
              :title="$t('tasks.editTaskAria', { name: node.task.name })"
              @click="editingTaskId === node.task.id ? cancelEditTask() : startEditTask(node.task)"
            >
              <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="catalog-task-delete-trigger"
              class="inline-flex h-7 w-7 items-center justify-center text-text-muted hover:text-destructive transition-colors"
              :aria-label="$t('catalog.deleteTaskAria', { name: node.task.name })"
              :title="$t('catalog.deleteTaskAria', { name: node.task.name })"
              @click="emit('deleteTask', node.task)"
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Inline Task Edit Form -->
        <form
          v-if="editingTaskId === node.task.id"
          class="mt-3 border border-border-hairline bg-bg-elevated p-3 space-y-2.5"
          @submit.prevent="submitEditTask(node.task.id)"
        >
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input
              v-model="editName"
              type="text"
              required
              class="sm:col-span-9 h-9 border border-border-input bg-bg-primary px-3 text-ui text-text-primary focus:border-signal focus:outline-none"
            />
            <input
              v-model="editTargetHours"
              type="number"
              min="0"
              step="0.5"
              :placeholder="$t('catalog.targetHoursPlaceholder')"
              class="tabular-telemetry sm:col-span-3 h-9 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
            />
          </div>
          <textarea
            v-model="editDescription"
            rows="2"
            :placeholder="$t('catalog.taskDescriptionPlaceholder')"
            class="w-full border border-border-input bg-bg-primary p-2.5 text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1 border border-border-hairline px-3 text-xs text-text-muted hover:text-text-primary"
              @click="cancelEditTask"
            >
              <X class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('confirm.cancelAction') }}</span>
            </button>
            <button
              type="submit"
              class="btn-press inline-flex h-8 items-center gap-1 bg-accent px-3 text-xs font-semibold uppercase text-white hover:bg-accent-hover"
            >
              <Check class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('catalog.saveChanges') }}</span>
            </button>
          </div>
        </form>

        <!-- Rendered Basic Markdown Description -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-else-if="node.task.description"
          class="mt-2 border-l-2 border-border-hairline pl-3 text-ui leading-relaxed text-text-muted space-y-1"
          v-html="renderBasicMarkdown(node.task.description)"
        />
      </div>

      <!-- Recursive Child Subtasks / Sub-subtasks (Strictly Same-Parent Siblings) -->
      <div v-if="node.children.length > 0" class="border-t border-border-hairline">
        <TasksTaskTreeLevel
          :nodes="node.children"
          :depth="depth + 1"
          :running-task-id="runningTaskId"
          :tracked-seconds-by-task="trackedSecondsByTask"
          :unsynced-hours-by-task="unsyncedHoursByTask"
          :ado-connected="adoConnected"
          :ado-org-url="adoOrgUrl"
          :ado-project="adoProject"
          :ado-enabled-for-project="adoEnabledForProject"
          @reorder="emit('reorder', $event)"
          @start-timer="emit('startTimer', $event)"
          @cycle-status="emit('cycleStatus', $event)"
          @prefill-subtask="emit('prefillSubtask', $event)"
          @delete-task="emit('deleteTask', $event)"
          @save-edit="emit('saveEdit', $event)"
          @link-ado="emit('linkAdo', $event)"
          @create-ado="emit('createAdo', $event)"
        />
      </div>
    </li>

    <li aria-live="polite" class="sr-only">
      {{ liveAnnouncement }}
    </li>
  </ul>
</template>
