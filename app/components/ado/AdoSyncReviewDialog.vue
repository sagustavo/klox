<script setup lang="ts">
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import type { UiSelectOption } from '~/components/ui/Select.vue';
import {
  buildAdoSyncCandidates,
  groupAdoSyncCandidatesByParent,
  roundHours2,
  type AdoErrorCode,
  type AdoSyncCandidate,
  type AdoSyncParentGroup,
  type AdoWorkItemSummary,
  type UnplannedAdoTaskCandidate,
} from '~/domain/ado';
import { formatHMS } from '~/domain/duration';
import type { EntityId } from '~/domain/types';
import { useAdoStore, type AdoPushExecutionResult } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';
import type { AdoSelectedWorkItem } from './AdoWorkItemPickerPopover.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    filterProjectId?: EntityId;
  }>(),
  {
    filterProjectId: undefined,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timeLogsStore = useTimeLogsStore();
const prefsStore = usePreferencesStore();
const adoStore = useAdoStore();
const { formatDateKey } = useFormat(() => prefsStore.preferences);

interface ItemDraft {
  selected: boolean;
  deltaHours: number;
  expandedLogs: boolean;
}

interface SuggestedChildDraft {
  selected: boolean;
  title: string;
  workItemType: string;
  deltaHours: number;
  expandedLogs: boolean;
  creating: boolean;
  error: AdoErrorCode | null;
}

const drafts = ref<Record<string, ItemDraft>>({});
const suggestedDrafts = ref<Record<string, SuggestedChildDraft>>({});
const submittingSync = ref(false);
const collapsedGroupKeys = ref<Set<string>>(new Set());
const pulledMap = ref<Record<string, AdoWorkItemSummary & { orgUrl: string; project: string }>>({});
const pulling = ref(false);
const pullError = ref<AdoErrorCode | null>(null);
const pushResults = ref<AdoPushExecutionResult[]>([]);
const pushError = ref<AdoErrorCode | null>(null);

// Inline unplanned task creation state inside the modal (no stacked modal focus traps)
const inlineCreateTaskId = ref<EntityId | null>(null);
const inlineCreateTitle = ref('');
const inlineCreateType = ref('Task');
const inlineCreatePushHours = ref(true);
const inlineCreating = ref(false);
const inlineCreateError = ref<AdoErrorCode | null>(null);

const inlineCreateTypeOptions = computed<UiSelectOption<string>[]>(() => {
  const types =
    adoStore.workItemTypes.length > 0
      ? adoStore.workItemTypes
      : [
          { name: 'Task', supportsCompletedWork: true },
          { name: 'Bug', supportsCompletedWork: true },
        ];
  return types.map((wt) => ({
    value: wt.name,
    label: wt.name,
  }));
});

function getChildTypeOptionsForConn(connectionId: string): UiSelectOption<string>[] {
  const raw = adoStore.workItemTypesByConn[connectionId] ?? adoStore.workItemTypes;
  const supported = raw.filter((wt) => wt.supportsCompletedWork);
  const list =
    supported.length > 0
      ? supported
      : raw.length > 0
        ? raw
        : [
            { name: 'Task', supportsCompletedWork: true },
            { name: 'Bug', supportsCompletedWork: true },
          ];
  return list.map((wt) => ({ value: wt.name, label: wt.name }));
}

const candidates = computed(() =>
  buildAdoSyncCandidates({
    projects: catalogStore.projects,
    tasks: catalogStore.tasks,
    logs: timeLogsStore.logs,
    connections: adoStore.connections,
    filterProjectId: props.filterProjectId,
    allowParentTaskTracking: Boolean(
      prefsStore.preferences.taskTrackingPolicy?.allowParentTaskTracking
    ),
    workItemTypesByConn: adoStore.workItemTypesByConn,
  })
);

const readyGroups = computed<AdoSyncParentGroup[]>(() =>
  groupAdoSyncCandidatesByParent(
    candidates.value.readyItems,
    catalogStore.tasks,
    candidates.value.suggestedChildTasks
  )
);

const hasParentGroups = computed(() =>
  readyGroups.value.some((g) => g.isParentContainer)
);

const allParentGroupsCollapsed = computed(() => {
  const parents = readyGroups.value.filter((g) => g.isParentContainer);
  if (parents.length === 0) return false;
  return parents.every((g) => collapsedGroupKeys.value.has(g.key));
});

function isGroupExpanded(groupKey: string): boolean {
  return !collapsedGroupKeys.value.has(groupKey);
}

function toggleGroupExpanded(groupKey: string) {
  const next = new Set(collapsedGroupKeys.value);
  if (next.has(groupKey)) {
    next.delete(groupKey);
  } else {
    next.add(groupKey);
  }
  collapsedGroupKeys.value = next;
}

function toggleAllGroups() {
  const parents = readyGroups.value.filter((g) => g.isParentContainer);
  if (parents.length === 0) return;
  if (allParentGroupsCollapsed.value) {
    collapsedGroupKeys.value = new Set();
  } else {
    collapsedGroupKeys.value = new Set(parents.map((g) => g.key));
  }
}

function getPulledItem(key: string) {
  return pulledMap.value[key] ?? null;
}

function isCompletedWorkSupported(
  key: string,
  fallbackType?: string,
  connectionId?: string
): boolean {
  const pulled = getPulledItem(key);
  if (pulled) return pulled.supportsCompletedWork;
  const connTypes =
    (connectionId ? adoStore.workItemTypesByConn[connectionId] : undefined) ??
    adoStore.workItemTypes;
  if (fallbackType && connTypes.length > 0) {
    const match = connTypes.find((wt) => wt.name.toLowerCase() === fallbackType.toLowerCase());
    if (match) return match.supportsCompletedWork;
  }
  return true;
}

function isItemSupported(item: AdoSyncCandidate): boolean {
  return isCompletedWorkSupported(
    item.key,
    getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType,
    item.connectionId
  );
}

function getGroupSelectionState(group: AdoSyncParentGroup): 'none' | 'some' | 'all' {
  const selectableReady = group.items.filter((item) => isItemSupported(item));
  const totalSelectable = selectableReady.length + group.suggestedChildren.length;
  if (totalSelectable === 0) return 'none';
  const checkedReady = selectableReady.filter((item) => drafts.value[item.key]?.selected).length;
  const checkedSuggested = group.suggestedChildren.filter(
    (s) => suggestedDrafts.value[s.key]?.selected
  ).length;
  const checkedCount = checkedReady + checkedSuggested;
  if (checkedCount === 0) return 'none';
  if (checkedCount === totalSelectable) return 'all';
  return 'some';
}

function toggleGroupSelection(group: AdoSyncParentGroup) {
  const selectableReady = group.items.filter((item) => isItemSupported(item));
  if (selectableReady.length === 0 && group.suggestedChildren.length === 0) return;
  const shouldSelect = getGroupSelectionState(group) !== 'all';
  for (const item of selectableReady) {
    if (drafts.value[item.key]) {
      drafts.value[item.key]!.selected = shouldSelect;
    }
  }
  for (const s of group.suggestedChildren) {
    if (suggestedDrafts.value[s.key]) {
      suggestedDrafts.value[s.key]!.selected = shouldSelect;
    }
  }
}

function getGroupDraftDeltaHours(group: AdoSyncParentGroup): number {
  let sum = 0;
  for (const item of group.items) {
    const draft = drafts.value[item.key];
    if (draft?.selected && isItemSupported(item)) {
      sum += Number(draft.deltaHours) || 0;
    }
  }
  for (const s of group.suggestedChildren) {
    const sDraft = suggestedDrafts.value[s.key];
    if (sDraft?.selected) {
      sum += Number(sDraft.deltaHours) || 0;
    }
  }
  return roundHours2(sum);
}

function initializeDrafts() {
  const next: Record<string, ItemDraft> = {};
  for (const item of candidates.value.readyItems) {
    const existing = drafts.value[item.key];
    const supported = isCompletedWorkSupported(
      item.key,
      getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType,
      item.connectionId
    );
    next[item.key] = {
      selected: supported ? (existing?.selected ?? true) : false,
      deltaHours:
        existing && Number.isFinite(existing.deltaHours)
          ? existing.deltaHours
          : item.recommendedDeltaHours,
      expandedLogs: existing?.expandedLogs ?? false,
    };
  }
  drafts.value = next;

  const nextSuggested: Record<string, SuggestedChildDraft> = {};
  for (const s of candidates.value.suggestedChildTasks) {
    const existing = suggestedDrafts.value[s.key];
    nextSuggested[s.key] = {
      selected: existing?.selected ?? true,
      title: existing ? existing.title : s.suggestedTitle,
      workItemType: existing?.workItemType || s.defaultWorkItemType,
      deltaHours:
        existing && Number.isFinite(existing.deltaHours)
          ? existing.deltaHours
          : s.recommendedHours,
      expandedLogs: existing?.expandedLogs ?? false,
      creating: existing?.creating ?? false,
      error: existing?.error ?? null,
    };
  }
  suggestedDrafts.value = nextSuggested;
}

async function refreshLiveFromAdo() {
  if (!authStore.user || !adoStore.isConnected) return;
  const items = candidates.value.readyItems;
  if (items.length === 0) {
    initializeDrafts();
    return;
  }

  pulling.value = true;
  pullError.value = null;
  try {
    const groupsMap = new Map<
      string,
      { connectionId: string; orgUrl: string; project: string; ids: number[] }
    >();
    for (const item of items) {
      const groupKey = `${item.connectionId}::${item.orgUrl.toLowerCase()}::${item.project.toLowerCase()}`;
      let grp = groupsMap.get(groupKey);
      if (!grp) {
        grp = {
          connectionId: item.connectionId,
          orgUrl: item.orgUrl,
          project: item.project,
          ids: [],
        };
        groupsMap.set(groupKey, grp);
      }
      if (!grp.ids.includes(item.workItemId)) {
        grp.ids.push(item.workItemId);
      }
    }

    const res = await adoStore.pullWorkItems({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      targets: Array.from(groupsMap.values()),
    });

    if (res.errorCode) {
      pullError.value = res.errorCode;
    } else {
      const nextPulled: Record<string, AdoWorkItemSummary & { orgUrl: string; project: string }> =
        {};
      for (const p of res.items) {
        nextPulled[`${p.orgUrl.toLowerCase()}::${p.project.toLowerCase()}::${p.id}`] = p;
      }
      pulledMap.value = nextPulled;
    }
  } finally {
    pulling.value = false;
    initializeDrafts();
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      pushResults.value = [];
      pushError.value = null;
      inlineCreateTaskId.value = null;
      inlineCreateError.value = null;
      collapsedGroupKeys.value = new Set();
      initializeDrafts();
      void refreshLiveFromAdo();
    }
  }
);

watch(
  [
    () => candidates.value.readyItems.length,
    () => candidates.value.suggestedChildTasks.length,
  ],
  () => {
    if (props.open) initializeDrafts();
  }
);

const selectedApprovals = computed(() => {
  return candidates.value.readyItems
    .filter((item) => {
      const d = drafts.value[item.key];
      return isItemSupported(item) && d?.selected && d.deltaHours > 0;
    })
    .map((item) => ({
      connectionId: item.connectionId,
      workItemId: item.workItemId,
      orgUrl: item.orgUrl,
      project: item.project,
      approvedDeltaHours: roundHours2(drafts.value[item.key]?.deltaHours ?? 0),
      taskIds: item.tasks.map((t) => t.id),
      logIds: item.logs.map((entry) => entry.log.id),
    }));
});

const selectedSuggestedCreations = computed(() =>
  candidates.value.suggestedChildTasks
    .filter((s) => {
      const d = suggestedDrafts.value[s.key];
      return Boolean(d?.selected && d.deltaHours > 0);
    })
    .map((s) => {
      const d = suggestedDrafts.value[s.key]!;
      return {
        candidate: s,
        title: d.title.trim(),
        workItemType: d.workItemType || s.defaultWorkItemType,
        deltaHours: roundHours2(d.deltaHours),
      };
    })
);

const hasInvalidSelectedSuggestedTitle = computed(() =>
  selectedSuggestedCreations.value.some((entry) => !entry.title)
);

const totalSelectedCount = computed(
  () => selectedApprovals.value.length + selectedSuggestedCreations.value.length
);

const totalApprovedHours = computed(() =>
  roundHours2(
    selectedApprovals.value.reduce((sum, a) => sum + a.approvedDeltaHours, 0) +
      selectedSuggestedCreations.value.reduce((sum, s) => sum + s.deltaHours, 0)
  )
);

async function submitSingleSuggestedChild(key: string) {
  if (!authStore.user || submittingSync.value) return;
  const candidate = candidates.value.suggestedChildTasks.find((s) => s.key === key);
  const draft = suggestedDrafts.value[key];
  if (!candidate || !draft || draft.creating) return;
  const title = draft.title.trim();
  if (!title) {
    draft.error = 'ADO_INVALID_INPUT';
    return;
  }

  draft.creating = true;
  draft.error = null;
  try {
    const res = await adoStore.createChildWorkItemForParentLogs({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      connectionId: candidate.connectionId,
      parentTaskId: candidate.parentTask.id,
      parentWorkItemId: candidate.parentWorkItemId,
      orgUrl: candidate.orgUrl,
      project: candidate.project,
      workItemType: draft.workItemType || candidate.defaultWorkItemType,
      title,
      initialCompletedWork: roundHours2(draft.deltaHours),
      logIds: candidate.logs.map((l) => l.id),
    });
    if (!res.ok || !res.item) {
      draft.error = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }
    pushResults.value = [
      ...pushResults.value,
      {
        workItemId: res.item.id,
        orgUrl: res.item.orgUrl,
        project: res.item.project,
        ok: true,
        title: res.item.title,
        workItemType: res.item.workItemType,
        previousCompletedWork: 0,
        newCompletedWork: res.item.completedWork,
        url: res.item.url,
      },
    ];
  } finally {
    draft.creating = false;
  }
}

function startInlineCreate(u: UnplannedAdoTaskCandidate) {
  inlineCreateTaskId.value = u.task.id;
  inlineCreateTitle.value = u.task.name;
  inlineCreateType.value = u.target.defaultWorkItemType || 'Task';
  inlineCreatePushHours.value = u.recommendedHours > 0;
  inlineCreateError.value = null;
}

async function submitInlineCreate(u: UnplannedAdoTaskCandidate) {
  if (!authStore.user || inlineCreating.value || !inlineCreateTitle.value.trim()) return;
  inlineCreating.value = true;
  inlineCreateError.value = null;
  try {
    const res = await adoStore.createWorkItemForTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      connectionId: u.target.connectionId,
      taskId: u.task.id,
      orgUrl: u.target.orgUrl,
      project: u.target.project,
      workItemType: inlineCreateType.value,
      title: inlineCreateTitle.value.trim(),
      initialCompletedWork: inlineCreatePushHours.value ? u.recommendedHours : 0,
      initialLogIds: inlineCreatePushHours.value ? u.logs.map((l) => l.id) : [],
    });
    if (!res.ok) {
      inlineCreateError.value = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }
    inlineCreateTaskId.value = null;
    await refreshLiveFromAdo();
  } finally {
    inlineCreating.value = false;
  }
}

async function handleLinkExistingUnplanned(
  u: UnplannedAdoTaskCandidate,
  picked: AdoSelectedWorkItem | null
) {
  if (!authStore.user || !picked) return;
  await catalogStore.updateTask({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    taskId: u.task.id,
    name: u.task.name,
    description: u.task.description,
    targetHours: u.task.targetHours ?? null,
    externalWorkItemId: String(picked.id),
    externalWorkItemTitle: picked.title,
    externalWorkItemType: picked.workItemType,
    externalWorkItemUrl: picked.url,
    externalOrgUrl: picked.orgUrl,
    externalProject: picked.project,
    completedWorkHours: picked.completedWork,
    externalSyncedAt: new Date().toISOString(),
  });
  await refreshLiveFromAdo();
}

async function handleApproveAndPush() {
  if (
    !authStore.user ||
    totalSelectedCount.value === 0 ||
    hasInvalidSelectedSuggestedTitle.value ||
    adoStore.syncing ||
    submittingSync.value
  ) {
    return;
  }
  submittingSync.value = true;
  pushError.value = null;
  const combinedResults: AdoPushExecutionResult[] = [];
  try {
    if (selectedApprovals.value.length > 0) {
      const res = await adoStore.pushApprovedHours({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        approvals: selectedApprovals.value,
      });
      if (res.errorCode) {
        pushError.value = res.errorCode;
      } else {
        combinedResults.push(...res.results);
      }
    }

    for (const sEntry of selectedSuggestedCreations.value) {
      const cRes = await adoStore.createChildWorkItemForParentLogs({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        connectionId: sEntry.candidate.connectionId,
        parentTaskId: sEntry.candidate.parentTask.id,
        parentWorkItemId: sEntry.candidate.parentWorkItemId,
        orgUrl: sEntry.candidate.orgUrl,
        project: sEntry.candidate.project,
        workItemType: sEntry.workItemType,
        title: sEntry.title,
        initialCompletedWork: sEntry.deltaHours,
        logIds: sEntry.candidate.logs.map((l) => l.id),
      });
      if (cRes.ok && cRes.item) {
        combinedResults.push({
          workItemId: cRes.item.id,
          orgUrl: cRes.item.orgUrl,
          project: cRes.item.project,
          ok: true,
          title: cRes.item.title,
          workItemType: cRes.item.workItemType,
          previousCompletedWork: 0,
          newCompletedWork: cRes.item.completedWork,
          url: cRes.item.url,
        });
      } else if (cRes.errorCode && !pushError.value) {
        pushError.value = cRes.errorCode;
      }
    }

    if (combinedResults.length > 0) {
      pushResults.value = combinedResults;
    }
  } finally {
    submittingSync.value = false;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        data-testid="ado-sync-review-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[88svh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none"
      >
        <div class="signal-line shrink-0" aria-hidden="true" />

        <!-- Header -->
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-border-hairline px-6 py-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <GitBranch class="h-4 w-4 text-signal" aria-hidden="true" />
              <DialogTitle as="h1" class="display-wide text-base tracking-[0.12em] text-text-primary">
                {{ $t('ado.reviewModal.title') }}
              </DialogTitle>
              <span class="tabular-telemetry border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal">
                {{ $t('ado.badges.earlyAccess') }}
              </span>
            </div>
            <DialogDescription class="mt-1 text-ui text-text-muted">
              {{ $t('ado.reviewModal.subtitle') }}
            </DialogDescription>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              :disabled="pulling || adoStore.syncing"
              class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-primary hover:border-signal transition-colors disabled:opacity-50"
              @click="refreshLiveFromAdo"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="pulling ? 'animate-spin' : ''" aria-hidden="true" />
              <span>{{ $t('ado.reviewModal.refreshButton') }}</span>
            </button>

            <DialogClose as-child>
              <button
                type="button"
                :aria-label="$t('confirm.cancelAction')"
                class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </div>

        <!-- Scrollable Review Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div
            v-if="pullError || pushError"
            role="alert"
            class="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-ui text-destructive"
          >
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{{ $t(`ado.errors.${pushError || pullError}`) }}</span>
          </div>

          <!-- Push Receipts -->
          <div
            v-if="pushResults.length > 0"
            class="border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2"
          >
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
              <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
              <span>{{ $t('ado.reviewModal.resultsHeader') }}</span>
            </div>
            <ul class="space-y-1.5 text-ui">
              <li
                v-for="r in pushResults"
                :key="`${r.project}-${r.workItemId}`"
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <span class="tabular-telemetry text-text-primary">
                  #{{ r.workItemId }} {{ r.title || '' }}
                </span>
                <span v-if="r.ok" class="tabular-telemetry font-semibold text-emerald-500">
                  {{ (r.previousCompletedWork ?? 0).toFixed(2) }}h → {{ (r.newCompletedWork ?? 0).toFixed(2) }}h ✓
                </span>
                <span v-else class="text-destructive">
                  {{ $t(`ado.errors.${r.errorCode ?? 'ADO_UNAVAILABLE'}`) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Section 1: Linked Work Items Ready to Sync (Tree-Grouped by Parent) -->
          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="label-eyebrow text-signal">
                {{
                  $t('ado.reviewModal.readySection', {
                    count: candidates.readyItems.length + candidates.suggestedChildTasks.length,
                  })
                }}
              </h2>
              <div class="flex items-center gap-2">
                <span v-if="pulling" class="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <Loader2 class="h-3.5 w-3.5 animate-spin text-signal" aria-hidden="true" />
                  <span>{{ $t('ado.reviewModal.pullingLive') }}</span>
                </span>
                <button
                  v-if="hasParentGroups"
                  type="button"
                  data-testid="ado-review-toggle-all-groups"
                  class="btn-press inline-flex h-7 items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 text-xs font-medium text-text-muted hover:border-signal/60 hover:text-text-primary transition-colors"
                  @click="toggleAllGroups"
                >
                  <ChevronsUpDown v-if="allParentGroupsCollapsed" class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  <ChevronsDownUp v-else class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  <span>
                    {{
                      allParentGroupsCollapsed
                        ? $t('ado.reviewModal.expandAllParents')
                        : $t('ado.reviewModal.collapseAllParents')
                    }}
                  </span>
                </button>
              </div>
            </div>

            <div
              v-if="candidates.readyItems.length === 0 && candidates.suggestedChildTasks.length === 0"
              class="border border-border-hairline bg-bg-primary p-5 text-center text-ui text-text-muted"
            >
              {{ $t('ado.reviewModal.emptyReady') }}
            </div>

            <div
              v-for="group in readyGroups"
              :key="group.key"
              :class="
                group.isParentContainer
                  ? 'border border-border-hairline bg-bg-primary p-3 sm:p-4 space-y-3'
                  : ''
              "
            >
              <!-- Collapsible Parent Header Row -->
              <div
                v-if="group.isParentContainer && group.parentTask"
                data-testid="ado-sync-parent-group"
                class="flex flex-wrap items-center justify-between gap-2.5 border border-border-hairline bg-bg-elevated px-3 py-2.5"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    type="checkbox"
                    :checked="getGroupSelectionState(group) === 'all'"
                    :indeterminate.prop="getGroupSelectionState(group) === 'some'"
                    :disabled="group.items.every((item) => !isItemSupported(item))"
                    :aria-label="$t('ado.reviewModal.toggleParentGroupAria', { title: group.parentTask.name })"
                    class="h-4 w-4 shrink-0 accent-accent cursor-pointer"
                    @change="toggleGroupSelection(group)"
                  />

                  <button
                    type="button"
                    data-testid="ado-review-parent-toggle"
                    :aria-expanded="isGroupExpanded(group.key)"
                    class="btn-press inline-flex h-6 w-6 shrink-0 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/60 hover:text-text-primary"
                    @click="toggleGroupExpanded(group.key)"
                  >
                    <ChevronDown
                      class="h-3.5 w-3.5 transition-transform"
                      :class="isGroupExpanded(group.key) ? 'rotate-0' : '-rotate-90'"
                      aria-hidden="true"
                    />
                  </button>

                  <AdoWorkItemTypeBadge
                    v-if="group.parentTask.externalWorkItemId"
                    :work-item-type="group.parentTask.externalWorkItemType || 'Task'"
                    :work-item-id="group.parentTask.externalWorkItemId"
                    :url="group.parentTask.externalWorkItemUrl || undefined"
                  />
                  <span
                    v-else
                    class="shrink-0 border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs font-medium text-text-muted"
                  >
                    {{ $t('ado.reviewModal.parentGroupBadge') }}
                  </span>

                  <a
                    v-if="group.parentTask.externalWorkItemUrl"
                    :href="group.parentTask.externalWorkItemUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="min-w-0 truncate text-sm font-semibold text-text-primary hover:text-signal hover:underline"
                  >
                    {{ group.parentTask.name }}
                  </a>
                  <span v-else class="min-w-0 truncate text-sm font-semibold text-text-primary">
                    {{ group.parentTask.name }}
                  </span>
                </div>

                <!-- Parent Rollup Summary -->
                <div class="tabular-telemetry flex flex-wrap items-center gap-2 text-xs">
                  <span class="border border-border-hairline bg-bg-primary px-2 py-0.5 text-text-muted">
                    {{
                      $t('ado.reviewModal.childItemsCount', {
                        count: group.items.length + group.suggestedChildren.length,
                      })
                    }}
                  </span>
                  <span
                    v-if="group.suggestedChildren.length > 0"
                    class="border border-signal/40 bg-signal-soft px-2 py-0.5 font-semibold text-signal"
                  >
                    +{{ group.suggestedChildren.length }} {{ $t('ado.reviewModal.suggestedChildBadge') }}
                  </span>
                  <span class="font-semibold text-signal">
                    +{{ getGroupDraftDeltaHours(group).toFixed(2) }}h
                  </span>
                  <span class="text-text-muted">
                    ({{ formatHMS(group.totalUnsyncedSeconds) }})
                  </span>
                </div>
              </div>

              <!-- Child Cards (indented along left rail under parent) OR Standalone Root Card -->
              <div
                v-if="!group.isParentContainer || isGroupExpanded(group.key)"
                :class="
                  group.isParentContainer
                    ? 'ml-4 sm:ml-6 border-l-2 border-l-signal/40 pl-3 sm:pl-4 space-y-2.5'
                    : ''
                "
              >
                <div
                  v-for="item in group.items"
                  :key="item.key"
                  data-testid="ado-sync-review-item"
                  class="border border-border-hairline bg-bg-primary p-4 space-y-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <label class="flex items-start gap-3 min-w-0 flex-1 cursor-pointer">
                      <input
                        v-if="drafts[item.key]"
                        v-model="drafts[item.key]!.selected"
                        type="checkbox"
                        :disabled="!isItemSupported(item)"
                        class="mt-1 h-4 w-4 accent-accent"
                      />
                      <div class="min-w-0 space-y-1">
                        <div class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <span
                            class="h-2.5 w-2.5 shrink-0"
                            :style="{ backgroundColor: item.projectColor }"
                            aria-hidden="true"
                          />
                          <span>{{ item.projectName }}</span>
                          <span>·</span>
                          <span class="truncate font-medium text-text-primary">
                            {{ item.hierarchicalTaskLabel }}
                          </span>
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                          <AdoWorkItemTypeBadge
                            :work-item-type="getPulledItem(item.key)?.workItemType || item.cachedWorkItemType"
                            :work-item-id="item.workItemId"
                            :url="getPulledItem(item.key)?.url || item.cachedUrl"
                          />
                          <a
                            :href="getPulledItem(item.key)?.url || item.cachedUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-sm font-semibold text-text-primary hover:text-signal hover:underline"
                          >
                            {{ getPulledItem(item.key)?.title || item.cachedTitle || `#${item.workItemId}` }}
                          </a>
                        </div>
                      </div>
                    </label>

                    <!-- Human-in-the-Loop Delta Math -->
                    <div
                      v-if="drafts[item.key]"
                      class="flex flex-wrap items-center gap-2 border border-border-hairline bg-bg-elevated px-3 py-2"
                    >
                      <div class="text-right">
                        <div class="text-xs text-text-muted">{{ $t('ado.reviewModal.currentAdoLabel') }}</div>
                        <div class="tabular-telemetry text-sm font-semibold text-text-primary">
                          {{ (getPulledItem(item.key)?.completedWork ?? item.cachedCompletedWork).toFixed(2) }}h
                        </div>
                      </div>

                      <span class="text-text-muted">+</span>

                      <div>
                        <label
                          :for="`delta-${item.key}`"
                          class="block text-xs text-text-muted"
                        >
                          {{ $t('ado.reviewModal.deltaLabel') }}
                        </label>
                        <input
                          :id="`delta-${item.key}`"
                          v-model.number="drafts[item.key]!.deltaHours"
                          type="number"
                          min="0"
                          step="0.01"
                          :disabled="!isItemSupported(item)"
                          class="tabular-telemetry h-8 w-20 border border-border-input bg-bg-primary px-2 text-sm font-semibold text-signal focus:border-signal focus:outline-none"
                        />
                      </div>

                      <span class="text-text-muted">=</span>

                      <div class="text-right">
                        <div class="text-xs text-text-muted">{{ $t('ado.reviewModal.newTotalLabel') }}</div>
                        <div class="tabular-telemetry text-sm font-semibold text-emerald-500">
                          {{
                            roundHours2(
                              (getPulledItem(item.key)?.completedWork ?? item.cachedCompletedWork) +
                                (drafts[item.key]!.deltaHours || 0)
                            ).toFixed(2)
                          }}h
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Scrum / Process Capability Warning -->
                  <div
                    v-if="!isItemSupported(item)"
                    class="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-500"
                  >
                    <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {{
                        $t('ado.scrumNotice.itemUnsupported', {
                          type: getPulledItem(item.key)?.workItemType || item.cachedWorkItemType || 'Work Item',
                          project: item.project,
                        })
                      }}
                    </span>
                  </div>

                  <!-- Contributing Unsynced Activities Toggle -->
                  <div v-if="drafts[item.key]">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-signal transition-colors"
                      @click="drafts[item.key]!.expandedLogs = !drafts[item.key]!.expandedLogs"
                    >
                      <ChevronDown
                        class="h-3.5 w-3.5 transition-transform"
                        :class="drafts[item.key]!.expandedLogs ? 'rotate-0' : '-rotate-90'"
                        aria-hidden="true"
                      />
                      <span class="tabular-telemetry">
                        {{
                          $t('ado.reviewModal.contributingActivities', {
                            count: item.logs.length,
                            duration: formatHMS(item.unsyncedSeconds),
                          })
                        }}
                      </span>
                    </button>

                    <ul
                      v-if="drafts[item.key]!.expandedLogs"
                      class="mt-2 divide-y divide-border-subtle border border-border-hairline bg-bg-elevated"
                    >
                      <li
                        v-for="entry in item.logs"
                        :key="entry.log.id"
                        class="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div class="flex flex-wrap items-center gap-2 min-w-0">
                          <span class="tabular-telemetry text-text-muted shrink-0">
                            {{ formatDateKey(entry.log.dateKey) }}
                          </span>
                          <span
                            v-if="entry.isRolledUpFromDescendant"
                            class="border border-signal/35 bg-signal-soft px-1.5 py-0.5 text-xs font-medium text-signal shrink-0"
                          >
                            ↳ {{ entry.sourceTaskLabel }}
                          </span>
                          <span class="truncate text-text-primary">{{ entry.log.description }}</span>
                        </div>
                        <span class="tabular-telemetry shrink-0 font-medium text-signal">
                          +{{ formatHMS(entry.unsyncedSeconds) }}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Suggested New Child Tasks (Generated from Direct Parent Tracking) -->
                <div
                  v-for="s in group.suggestedChildren"
                  :key="s.key"
                  data-testid="ado-sync-suggested-child"
                  class="border border-dashed border-signal/60 bg-signal-soft/20 p-4 space-y-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        v-if="suggestedDrafts[s.key]"
                        v-model="suggestedDrafts[s.key]!.selected"
                        type="checkbox"
                        :aria-label="$t('ado.reviewModal.suggestedTitleLabel')"
                        class="mt-1 h-4 w-4 shrink-0 accent-accent cursor-pointer"
                      />

                      <div class="min-w-0 flex-1 space-y-2.5">
                        <div class="flex flex-wrap items-center gap-2 text-xs">
                          <span class="border border-signal/50 bg-signal-soft px-2 py-0.5 font-semibold uppercase tracking-wider text-signal">
                            {{ $t('ado.reviewModal.suggestedChildBadge') }}
                          </span>
                          <span class="tabular-telemetry text-text-muted">
                            {{ $t('ado.reviewModal.suggestedChildOfParent', { id: s.parentWorkItemId }) }}
                          </span>
                        </div>

                        <div
                          v-if="suggestedDrafts[s.key]"
                          class="grid grid-cols-1 gap-2 sm:grid-cols-12"
                        >
                          <div class="sm:col-span-8">
                            <label
                              :for="`suggested-title-${s.key}`"
                              class="mb-1 block text-xs text-text-muted"
                            >
                              {{ $t('ado.reviewModal.suggestedTitleLabel') }}
                            </label>
                            <input
                              :id="`suggested-title-${s.key}`"
                              v-model="suggestedDrafts[s.key]!.title"
                              type="text"
                              maxlength="200"
                              data-testid="ado-suggested-child-title"
                              :placeholder="$t('ado.reviewModal.suggestedTitlePlaceholder')"
                              class="h-9 w-full border bg-bg-primary px-3 text-ui text-text-primary focus:outline-none"
                              :class="
                                suggestedDrafts[s.key]!.selected && !suggestedDrafts[s.key]!.title.trim()
                                  ? 'border-destructive focus:border-destructive'
                                  : 'border-border-input focus:border-signal'
                              "
                            />
                            <p
                              v-if="suggestedDrafts[s.key]!.selected && !suggestedDrafts[s.key]!.title.trim()"
                              class="mt-1 text-xs text-destructive"
                            >
                              {{ $t('ado.reviewModal.suggestedChildTitleRequired') }}
                            </p>
                          </div>

                          <div class="sm:col-span-4">
                            <label class="mb-1 block text-xs text-text-muted">
                              {{ $t('ado.reviewModal.suggestedTypeLabel') }}
                            </label>
                            <UiSelect
                              v-model="suggestedDrafts[s.key]!.workItemType"
                              :options="getChildTypeOptionsForConn(s.connectionId)"
                              size="sm"
                              test-id="ado-suggested-child-type"
                              :aria-label="$t('ado.reviewModal.suggestedTypeLabel')"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Initial Hours Box + Quick Create CTA -->
                    <div v-if="suggestedDrafts[s.key]" class="flex flex-col items-end gap-2 shrink-0">
                      <div class="flex flex-wrap items-center gap-2 border border-border-hairline bg-bg-elevated px-3 py-2">
                        <div class="text-right">
                          <div class="text-xs text-text-muted">{{ $t('ado.reviewModal.currentAdoLabel') }}</div>
                          <div class="tabular-telemetry text-sm font-semibold text-text-primary">
                            0.00h
                          </div>
                        </div>

                        <span class="text-text-muted">+</span>

                        <div>
                          <label
                            :for="`suggested-delta-${s.key}`"
                            class="block text-xs text-text-muted"
                          >
                            {{ $t('ado.reviewModal.deltaLabel') }}
                          </label>
                          <input
                            :id="`suggested-delta-${s.key}`"
                            v-model.number="suggestedDrafts[s.key]!.deltaHours"
                            type="number"
                            min="0"
                            step="0.01"
                            class="tabular-telemetry h-8 w-20 border border-border-input bg-bg-primary px-2 text-sm font-semibold text-signal focus:border-signal focus:outline-none"
                          />
                        </div>

                        <span class="text-text-muted">=</span>

                        <div class="text-right">
                          <div class="text-xs text-text-muted">{{ $t('ado.reviewModal.newTotalLabel') }}</div>
                          <div class="tabular-telemetry text-sm font-semibold text-emerald-500">
                            {{ roundHours2(suggestedDrafts[s.key]!.deltaHours || 0).toFixed(2) }}h
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        :disabled="suggestedDrafts[s.key]!.creating || !suggestedDrafts[s.key]!.title.trim() || submittingSync"
                        data-testid="ado-suggested-child-create-now"
                        class="btn-press inline-flex h-8 items-center gap-1.5 border border-signal/50 bg-bg-primary px-2.5 text-xs font-medium text-signal hover:bg-accent hover:text-white transition-colors disabled:opacity-45"
                        @click="submitSingleSuggestedChild(s.key)"
                      >
                        <Loader2
                          v-if="suggestedDrafts[s.key]!.creating"
                          class="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <Plus v-else class="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {{
                            suggestedDrafts[s.key]!.creating
                              ? $t('ado.reviewModal.creatingChild')
                              : $t('ado.reviewModal.createChildNowButton')
                          }}
                        </span>
                      </button>
                    </div>
                  </div>

                  <p v-if="suggestedDrafts[s.key]?.error" class="text-xs text-destructive">
                    {{ $t(`ado.errors.${suggestedDrafts[s.key]!.error}`) }}
                  </p>

                  <!-- Contributing Parent Activities -->
                  <div v-if="suggestedDrafts[s.key]">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-signal transition-colors"
                      @click="suggestedDrafts[s.key]!.expandedLogs = !suggestedDrafts[s.key]!.expandedLogs"
                    >
                      <ChevronDown
                        class="h-3.5 w-3.5 transition-transform"
                        :class="suggestedDrafts[s.key]!.expandedLogs ? 'rotate-0' : '-rotate-90'"
                        aria-hidden="true"
                      />
                      <span class="tabular-telemetry">
                        {{
                          $t('ado.reviewModal.contributingActivities', {
                            count: s.logs.length,
                            duration: formatHMS(s.unsyncedSeconds),
                          })
                        }}
                      </span>
                    </button>

                    <ul
                      v-if="suggestedDrafts[s.key]!.expandedLogs"
                      class="mt-2 divide-y divide-border-subtle border border-border-hairline bg-bg-elevated"
                    >
                      <li
                        v-for="log in s.logs"
                        :key="log.id"
                        class="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div class="flex flex-wrap items-center gap-2 min-w-0">
                          <span class="tabular-telemetry text-text-muted shrink-0">
                            {{ formatDateKey(log.dateKey) }}
                          </span>
                          <span class="truncate text-text-primary">{{ log.description }}</span>
                        </div>
                        <span class="tabular-telemetry shrink-0 font-medium text-signal">
                          +{{ formatHMS(log.durationSeconds) }}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Section 2: Unplanned Tasks with Logged Activities -->
          <section v-if="candidates.unplannedTasks.length > 0" class="space-y-3 border-t border-border-hairline pt-4">
            <h2 class="label-eyebrow text-text-muted">
              {{ $t('ado.reviewModal.unplannedSection', { count: candidates.unplannedTasks.length }) }}
            </h2>

            <div
              v-for="u in candidates.unplannedTasks"
              :key="u.task.id"
              class="border border-border-hairline bg-bg-primary p-3.5 space-y-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 text-xs text-text-muted">
                    <span
                      class="h-2 w-2 shrink-0"
                      :style="{ backgroundColor: u.projectColor }"
                      aria-hidden="true"
                    />
                    <span>{{ u.projectName }}</span>
                    <span>→</span>
                    <span class="font-medium text-text-primary truncate">{{ u.hierarchicalTaskLabel }}</span>
                  </div>
                  <div class="tabular-telemetry mt-1 text-xs text-signal">
                    {{ formatHMS(u.totalSeconds) }} ({{ u.recommendedHours.toFixed(2) }}h)
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 shrink-0">
                  <AdoWorkItemPickerPopover
                    variant="pill"
                    :connection-id="u.target.connectionId"
                    :org-url="u.target.orgUrl"
                    :project="u.target.project"
                    @select="handleLinkExistingUnplanned(u, $event)"
                  />

                  <button
                    type="button"
                    class="btn-press inline-flex items-center gap-1.5 border border-signal/50 bg-signal-soft px-2.5 py-1 text-xs font-medium text-signal hover:bg-accent hover:text-white transition-colors"
                    @click="startInlineCreate(u)"
                  >
                    <Plus class="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{{ $t('ado.reviewModal.createInAdoButton') }}</span>
                  </button>
                </div>
              </div>

              <!-- Inline Minimal Work Item Creator -->
              <form
                v-if="inlineCreateTaskId === u.task.id"
                class="border-t border-border-hairline pt-3 space-y-2.5"
                @submit.prevent="submitInlineCreate(u)"
              >
                <p v-if="inlineCreateError" class="text-xs text-destructive">
                  {{ $t(`ado.errors.${inlineCreateError}`) }}
                </p>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    v-model="inlineCreateTitle"
                    type="text"
                    required
                    :placeholder="$t('ado.createModal.titleLabel')"
                    class="sm:col-span-8 h-9 border border-border-input bg-bg-elevated px-3 text-ui text-text-primary focus:border-signal focus:outline-none"
                  />
                  <UiSelect
                    v-model="inlineCreateType"
                    :options="inlineCreateTypeOptions"
                    :aria-label="$t('ado.createModal.typeLabel')"
                    class="sm:col-span-4"
                  />
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label class="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                    <input v-model="inlineCreatePushHours" type="checkbox" class="h-4 w-4 accent-accent" />
                    <span>{{ $t('ado.createModal.pushInitialHours', { hours: u.recommendedHours.toFixed(2) }) }}</span>
                  </label>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="h-8 border border-border-hairline px-2.5 text-xs text-text-muted hover:text-text-primary"
                      @click="inlineCreateTaskId = null"
                    >
                      {{ $t('confirm.cancelAction') }}
                    </button>
                    <button
                      type="submit"
                      :disabled="inlineCreating"
                      class="btn-press inline-flex h-8 items-center gap-1.5 bg-accent px-3 text-xs font-semibold uppercase text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      <Loader2 v-if="inlineCreating" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <Check v-else class="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{{ $t('ado.createModal.submitButton') }}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-hairline bg-bg-primary/50 px-6 py-4">
          <div class="tabular-telemetry text-ui text-text-muted">
            {{
              $t('ado.reviewModal.footerSummary', {
                count: totalSelectedCount,
                hours: totalApprovedHours.toFixed(2),
              })
            }}
          </div>

          <div class="flex items-center gap-2.5">
            <DialogClose as-child>
              <button
                type="button"
                class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:bg-bg-hover"
              >
                <span>{{ pushResults.length > 0 ? $t('ado.reviewModal.doneButton') : $t('confirm.cancelAction') }}</span>
                <BrandKeycapBadge keys="Esc" size="sm" />
              </button>
            </DialogClose>

            <button
              type="button"
              data-testid="ado-approve-push-btn"
              :disabled="totalSelectedCount === 0 || hasInvalidSelectedSuggestedTitle || adoStore.syncing || submittingSync"
              class="btn-press inline-flex h-9 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-45"
              @click="handleApproveAndPush"
            >
              <Loader2 v-if="adoStore.syncing || submittingSync" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Check v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('ado.reviewModal.approveButton') }}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
