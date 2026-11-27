<script setup lang="ts">
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
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
import {
  buildAdoSyncCandidates,
  roundHours2,
  type AdoErrorCode,
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

const drafts = ref<Record<string, ItemDraft>>({});
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

const candidates = computed(() =>
  buildAdoSyncCandidates({
    projects: catalogStore.projects,
    tasks: catalogStore.tasks,
    logs: timeLogsStore.logs,
    connection: adoStore.connection,
    filterProjectId: props.filterProjectId,
  })
);

function getPulledItem(key: string) {
  return pulledMap.value[key] ?? null;
}

function isCompletedWorkSupported(key: string, fallbackType?: string): boolean {
  const pulled = getPulledItem(key);
  if (pulled) return pulled.supportsCompletedWork;
  if (fallbackType && adoStore.workItemTypes.length > 0) {
    const match = adoStore.workItemTypes.find(
      (wt) => wt.name.toLowerCase() === fallbackType.toLowerCase()
    );
    if (match) return match.supportsCompletedWork;
  }
  return true;
}

function initializeDrafts() {
  const next: Record<string, ItemDraft> = {};
  for (const item of candidates.value.readyItems) {
    const existing = drafts.value[item.key];
    const supported = isCompletedWorkSupported(
      item.key,
      getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType
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
    const groupsMap = new Map<string, { orgUrl: string; project: string; ids: number[] }>();
    for (const item of items) {
      const groupKey = `${item.orgUrl.toLowerCase()}::${item.project.toLowerCase()}`;
      let grp = groupsMap.get(groupKey);
      if (!grp) {
        grp = { orgUrl: item.orgUrl, project: item.project, ids: [] };
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
      initializeDrafts();
      void refreshLiveFromAdo();
    }
  }
);

watch(
  () => candidates.value.readyItems.length,
  () => {
    if (props.open) initializeDrafts();
  }
);

const selectedApprovals = computed(() => {
  return candidates.value.readyItems
    .filter((item) => {
      const d = drafts.value[item.key];
      const supported = isCompletedWorkSupported(
        item.key,
        getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType
      );
      return supported && d?.selected && d.deltaHours > 0;
    })
    .map((item) => ({
      workItemId: item.workItemId,
      orgUrl: item.orgUrl,
      project: item.project,
      approvedDeltaHours: roundHours2(drafts.value[item.key]?.deltaHours ?? 0),
      taskIds: item.tasks.map((t) => t.id),
      logIds: item.logs.map((entry) => entry.log.id),
    }));
});

const totalApprovedHours = computed(() =>
  roundHours2(selectedApprovals.value.reduce((sum, a) => sum + a.approvedDeltaHours, 0))
);

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
  if (!authStore.user || selectedApprovals.value.length === 0 || adoStore.syncing) return;
  pushError.value = null;
  const res = await adoStore.pushApprovedHours({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    approvals: selectedApprovals.value,
  });
  if (res.errorCode) {
    pushError.value = res.errorCode;
    return;
  }
  pushResults.value = res.results;
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        data-testid="ado-sync-review-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[88svh] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none"
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

          <!-- Section 1: Linked Work Items Ready to Sync -->
          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="label-eyebrow text-signal">
                {{ $t('ado.reviewModal.readySection', { count: candidates.readyItems.length }) }}
              </h2>
              <span v-if="pulling" class="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <Loader2 class="h-3.5 w-3.5 animate-spin text-signal" aria-hidden="true" />
                <span>{{ $t('ado.reviewModal.pullingLive') }}</span>
              </span>
            </div>

            <div
              v-if="candidates.readyItems.length === 0"
              class="border border-border-hairline bg-bg-primary p-5 text-center text-ui text-text-muted"
            >
              {{ $t('ado.reviewModal.emptyReady') }}
            </div>

            <div
              v-for="item in candidates.readyItems"
              :key="item.key"
              class="border border-border-hairline bg-bg-primary p-4 space-y-3"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <label class="flex items-start gap-3 min-w-0 flex-1 cursor-pointer">
                  <input
                    v-if="drafts[item.key]"
                    v-model="drafts[item.key]!.selected"
                    type="checkbox"
                    :disabled="!isCompletedWorkSupported(item.key, getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType)"
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
                      <a
                        :href="getPulledItem(item.key)?.url || item.cachedUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tabular-telemetry inline-flex items-center gap-1 text-sm font-semibold text-signal hover:underline"
                      >
                        <span>#{{ item.workItemId }}</span>
                        <span>{{ getPulledItem(item.key)?.title || item.cachedTitle || '' }}</span>
                        <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <span class="border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs text-text-muted">
                        {{ getPulledItem(item.key)?.workItemType || item.cachedWorkItemType || 'Task' }}
                      </span>
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
                      :disabled="!isCompletedWorkSupported(item.key, getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType)"
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
                v-if="!isCompletedWorkSupported(item.key, getPulledItem(item.key)?.workItemType ?? item.cachedWorkItemType)"
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
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="tabular-telemetry text-text-muted shrink-0">
                        {{ formatDateKey(entry.log.dateKey) }}
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
                  <select
                    v-model="inlineCreateType"
                    class="sm:col-span-4 h-9 border border-border-input bg-bg-elevated px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
                  >
                    <option
                      v-for="wt in (adoStore.workItemTypes.length > 0 ? adoStore.workItemTypes : [{ name: 'Task', supportsCompletedWork: true }, { name: 'Bug', supportsCompletedWork: true }])"
                      :key="wt.name"
                      :value="wt.name"
                    >
                      {{ wt.name }}
                    </option>
                  </select>
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
                count: selectedApprovals.length,
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
              :disabled="selectedApprovals.length === 0 || adoStore.syncing"
              class="btn-press inline-flex h-9 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-45"
              @click="handleApproveAndPush"
            >
              <Loader2 v-if="adoStore.syncing" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Check v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('ado.reviewModal.approveButton') }}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
