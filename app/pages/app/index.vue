<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Play,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from 'reka-ui';
import {
  formatHMS,
  parseHMS,
  resolveTimeRange,
  toDateKey,
  toLocalTimeInputValue,
  zonedDateAndTimeToUtcIso,
} from '~/domain/duration';
import { UNASSIGNED_PROJECT_ID, applyProjectSwitch } from '~/domain/invariants';
import {
  TRACKER_FEED_WINDOW_DAYS,
  areAllTrackerDaysExpanded,
  buildSameDayGroupSignature,
  defaultExpandedTrackerDayKeys,
  findPageIndexForDateKey,
  groupLogsByCalendarDay,
  sliceTrackerFeedWindow,
  toggleAllTrackerDayKeys,
  type TrackerLogGroup,
} from '~/domain/trackerFeed';
import type { EntityId, Project, TimeLog } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useOnboardingStore } from '~/stores/onboarding';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const onboardingStore = useOnboardingStore();
const prefsStore = usePreferencesStore();
const timerStore = useTimerStore();
const timeLogsStore = useTimeLogsStore();
const { formatDateKey, formatDuration, formatTime } = useFormat(() => prefsStore.preferences);

// 7-day windowed pagination & day accordion state (NFR-1.1)
const currentPageIndex = ref(0);
const feedTopRef = ref<HTMLElement | null>(null);
const expandedDayKeys = ref<string[]>([]);

// Manual Time Log form state (FR-5.2: searchable tag multiselect, overlapping intervals & Start/Stop sync)
const showManualForm = ref(false);
const manualDescription = ref('');
const manualProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);
const manualTaskId = ref<EntityId | undefined>(undefined);
const manualTagIds = ref<EntityId[]>([]);
const manualBillable = ref(false);
const manualDate = ref(toDateKey(new Date(), 'UTC'));
const isManualDateValid = ref(true);
const manualStartHM = ref('09:00');
const manualEndHM = ref('10:00');
const manualDurationHMS = ref('01:00:00');

// Same-day grouped accordion state (FR-5.1)
const expandedGroupKeys = ref<Set<string>>(new Set());

onMounted(async () => {
  manualDate.value = toDateKey(new Date(), prefsStore.preferences.timeZone);
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timeLogsStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    onboardingStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
});

const activeTimeZone = computed(() => prefsStore.preferences.timeZone || 'UTC');

const manualScopedTags = computed(() =>
  catalogStore.getTagsForProject(manualProjectId.value)
);

const manualScopedTaskNodes = computed(() =>
  catalogStore.getFlattenedTasksForProject(manualProjectId.value)
);

function displayProjectName(project: Project | undefined, fallbackSnapshot?: string): string {
  if (project?.systemKey === 'unassigned') return t('catalog.unassigned');
  if (project) return project.name;
  return fallbackSnapshot || t('catalog.unassigned');
}

function isGroupExpanded(groupKey: string): boolean {
  return expandedGroupKeys.value.has(groupKey);
}

function toggleGroupExpanded(entryGroup: TrackerLogGroup) {
  if (!entryGroup.isGrouped) return;
  const next = new Set(expandedGroupKeys.value);
  if (next.has(entryGroup.groupKey)) {
    next.delete(entryGroup.groupKey);
  } else {
    next.add(entryGroup.groupKey);
  }
  expandedGroupKeys.value = next;
}

function migrateExpandedGroupKey(
  previousGroupKey: string,
  dateKey: string,
  updatedLogs: readonly TimeLog[]
) {
  if (!expandedGroupKeys.value.has(previousGroupKey) || updatedLogs.length === 0) return;
  const nextGroupKey = `${dateKey}|${buildSameDayGroupSignature(updatedLogs[0]!)}`;
  if (nextGroupKey === previousGroupKey) return;
  const next = new Set(expandedGroupKeys.value);
  next.delete(previousGroupKey);
  next.add(nextGroupKey);
  expandedGroupKeys.value = next;
}

function handleManualProjectChange(nextId: EntityId) {
  const proj = catalogStore.getProjectById(nextId);
  manualTaskId.value = undefined;
  if (!proj) {
    manualProjectId.value = nextId;
    manualTagIds.value = [];
    return;
  }
  const switched = applyProjectSwitch({
    nextProject: proj,
    currentTagIds: manualTagIds.value,
    allTags: catalogStore.tags,
  });
  manualProjectId.value = switched.projectId;
  manualTagIds.value = switched.tagIds;
  manualBillable.value = switched.isBillable;
}

function handleManualRangeChange() {
  const resolved = resolveTimeRange({
    dateKey: manualDate.value,
    startTimeInput: manualStartHM.value,
    endTimeInput: manualEndHM.value,
    timeZone: activeTimeZone.value,
  });
  if (resolved) {
    manualDurationHMS.value = formatHMS(resolved.durationSeconds);
  }
}

function handleManualDurationInput() {
  const durSeconds = parseHMS(manualDurationHMS.value);
  if (durSeconds === null || durSeconds <= 0) return;
  const startIso = zonedDateAndTimeToUtcIso(
    manualDate.value,
    manualStartHM.value,
    activeTimeZone.value
  );
  if (!startIso) return;
  const endMs = Date.parse(startIso) + durSeconds * 1000;
  manualEndHM.value = toLocalTimeInputValue(
    new Date(endMs),
    activeTimeZone.value,
    durSeconds % 60 !== 0
  );
}

async function handleSaveManualLog() {
  if (!authStore.user || !isManualDateValid.value) return;
  const tz = activeTimeZone.value;
  const durFromInput = parseHMS(manualDurationHMS.value);

  let startIso: string | null = null;
  let endIso: string | null = null;
  let durSeconds: number | null = null;

  if (durFromInput !== null && durFromInput >= 86_400) {
    startIso = zonedDateAndTimeToUtcIso(manualDate.value, manualStartHM.value, tz);
    if (startIso) {
      durSeconds = durFromInput;
      endIso = new Date(Date.parse(startIso) + durSeconds * 1000).toISOString();
    }
  } else {
    const resolved = resolveTimeRange({
      dateKey: manualDate.value,
      startTimeInput: manualStartHM.value,
      endTimeInput: manualEndHM.value,
      timeZone: tz,
    });
    if (resolved) {
      startIso = resolved.startTimeUTC;
      endIso = resolved.endTimeUTC;
      durSeconds = resolved.durationSeconds;
    } else if (durFromInput !== null && durFromInput > 0) {
      startIso = zonedDateAndTimeToUtcIso(manualDate.value, manualStartHM.value, tz);
      if (startIso) {
        durSeconds = durFromInput;
        endIso = new Date(Date.parse(startIso) + durSeconds * 1000).toISOString();
      }
    }
  }

  if (!startIso || !endIso || durSeconds === null || durSeconds <= 0) return;

  // FR-5.2: Intentionally permits entries overlapping existing historical TimeLogs
  const created = await timeLogsStore.createTimeLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    description: manualDescription.value.trim() || t('timer.manualFallbackDescription'),
    projectId: manualProjectId.value,
    taskId: manualTaskId.value,
    tagIds: manualTagIds.value,
    isBillable: manualBillable.value,
    startTimeUTC: startIso,
    endTimeUTC: endIso,
    durationSeconds: durSeconds,
    source: 'manual',
  });

  const createdDateKey = toDateKey(created.startTime, tz);
  currentPageIndex.value = findPageIndexForDateKey(
    allDayGroups.value,
    createdDateKey,
    TRACKER_FEED_WINDOW_DAYS
  );
  await nextTick();
  if (!expandedDayKeys.value.includes(createdDateKey)) {
    expandedDayKeys.value = [...expandedDayKeys.value, createdDateKey];
  }

  manualDescription.value = '';
  manualEndHM.value = '10:00';
  manualStartHM.value = '09:00';
  manualDurationHMS.value = '01:00:00';
  showManualForm.value = false;
}

// --- Toggl-Style Per-Property Inline Editing (Single TimeLog) ---

async function handleSingleDescriptionSave(log: TimeLog, nextDescription: string) {
  if (!authStore.user) return;
  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: [log.id],
    patch: { description: nextDescription },
  });
}

async function handleSingleProjectTaskSave(
  log: TimeLog,
  payload: { projectId: EntityId; taskId: EntityId | null }
) {
  if (!authStore.user) return;

  if (payload.projectId === log.projectId) {
    await timeLogsStore.updateTimeLogsBatch({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      logIds: [log.id],
      patch: { taskId: payload.taskId },
    });
    return;
  }

  const nextProject = catalogStore.getProjectById(payload.projectId);
  const switched = nextProject
    ? applyProjectSwitch({
        nextProject,
        currentTagIds: log.tagIds,
        allTags: catalogStore.tags,
      })
    : { projectId: payload.projectId, tagIds: [] as EntityId[], isBillable: log.isBillable };

  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: [log.id],
    patch: {
      projectId: switched.projectId,
      taskId: payload.taskId,
      tagIds: switched.tagIds,
      isBillable: switched.isBillable,
    },
  });
}

async function handleSingleTagsSave(log: TimeLog, nextTagIds: EntityId[]) {
  if (!authStore.user) return;
  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: [log.id],
    patch: { tagIds: nextTagIds },
  });
}

async function handleSingleBillableSave(log: TimeLog, nextBillable: boolean) {
  if (!authStore.user) return;
  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: [log.id],
    patch: { isBillable: nextBillable },
  });
}

async function handleSingleTimeRangeSave(
  log: TimeLog,
  payload: { startTimeUTC: string; endTimeUTC: string; durationSeconds: number }
) {
  if (!authStore.user) return;
  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: [log.id],
    patch: {
      startTimeUTC: payload.startTimeUTC,
      endTimeUTC: payload.endTimeUTC,
      durationSeconds: payload.durationSeconds,
    },
  });
}

// --- Toggl-Style Bulk Group Header Editing (Collapsed / Expanded TrackerLogGroup) ---

async function handleGroupDescriptionSave(entryGroup: TrackerLogGroup, nextDescription: string) {
  if (!authStore.user) return;
  const oldKey = entryGroup.groupKey;
  const updated = await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: entryGroup.items.map((item) => item.id),
    patch: { description: nextDescription },
  });
  migrateExpandedGroupKey(oldKey, entryGroup.dateKey, updated);
}

async function handleGroupProjectTaskSave(
  entryGroup: TrackerLogGroup,
  payload: { projectId: EntityId; taskId: EntityId | null }
) {
  if (!authStore.user) return;
  const oldKey = entryGroup.groupKey;

  if (payload.projectId === entryGroup.projectId) {
    const updated = await timeLogsStore.updateTimeLogsBatch({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      logIds: entryGroup.items.map((item) => item.id),
      patch: { taskId: payload.taskId },
    });
    migrateExpandedGroupKey(oldKey, entryGroup.dateKey, updated);
    return;
  }

  const nextProject = catalogStore.getProjectById(payload.projectId);
  const switched = nextProject
    ? applyProjectSwitch({
        nextProject,
        currentTagIds: entryGroup.tagIds,
        allTags: catalogStore.tags,
      })
    : {
        projectId: payload.projectId,
        tagIds: [] as EntityId[],
        isBillable: entryGroup.allBillable,
      };

  const updated = await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: entryGroup.items.map((item) => item.id),
    patch: {
      projectId: switched.projectId,
      taskId: payload.taskId,
      tagIds: switched.tagIds,
      isBillable: switched.isBillable,
    },
  });
  migrateExpandedGroupKey(oldKey, entryGroup.dateKey, updated);
}

async function handleGroupTagsSave(entryGroup: TrackerLogGroup, nextTagIds: EntityId[]) {
  if (!authStore.user) return;
  const oldKey = entryGroup.groupKey;
  const updated = await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: entryGroup.items.map((item) => item.id),
    patch: { tagIds: nextTagIds },
  });
  migrateExpandedGroupKey(oldKey, entryGroup.dateKey, updated);
}

async function handleGroupBillableSave(entryGroup: TrackerLogGroup, nextBillable: boolean) {
  if (!authStore.user) return;
  await timeLogsStore.updateTimeLogsBatch({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: entryGroup.items.map((item) => item.id),
    patch: { isBillable: nextBillable },
  });
}

type PendingDeleteTarget =
  | { kind: 'log'; log: TimeLog }
  | { kind: 'group'; entryGroup: TrackerLogGroup };

const pendingDeleteTarget = ref<PendingDeleteTarget | null>(null);
const isConfirmingDelete = ref(false);

const confirmDialogTitle = computed(() => {
  if (!pendingDeleteTarget.value) return '';
  return pendingDeleteTarget.value.kind === 'group'
    ? t('confirm.deleteGroupTitle')
    : t('confirm.deleteTimeLogTitle');
});

const confirmDialogDescription = computed(() => {
  if (!pendingDeleteTarget.value) return '';
  return pendingDeleteTarget.value.kind === 'group'
    ? t('confirm.deleteGroupDesc', { count: pendingDeleteTarget.value.entryGroup.count })
    : t('confirm.deleteTimeLogDesc');
});

const confirmDialogDetail = computed(() => {
  const target = pendingDeleteTarget.value;
  if (!target) return '';
  if (target.kind === 'group') {
    return `${target.entryGroup.description} · ${target.entryGroup.count}× · ${formatDuration(target.entryGroup.totalSeconds)}`;
  }
  return `${target.log.description} · ${formatDuration(target.log.durationSeconds)}`;
});

function requestDeleteLog(log: TimeLog) {
  pendingDeleteTarget.value = { kind: 'log', log };
}

function requestDeleteGroup(entryGroup: TrackerLogGroup) {
  pendingDeleteTarget.value = { kind: 'group', entryGroup };
}

async function confirmDeletePending() {
  if (!authStore.user || !pendingDeleteTarget.value || isConfirmingDelete.value) return;
  isConfirmingDelete.value = true;
  try {
    const target = pendingDeleteTarget.value;
    if (target.kind === 'log') {
      await timeLogsStore.deleteTimeLog({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        logId: target.log.id,
      });
    } else {
      const ids = target.entryGroup.items.map((item) => item.id);
      if (expandedGroupKeys.value.has(target.entryGroup.groupKey)) {
        const next = new Set(expandedGroupKeys.value);
        next.delete(target.entryGroup.groupKey);
        expandedGroupKeys.value = next;
      }
      await timeLogsStore.deleteTimeLogs({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        logIds: ids,
      });
    }
    pendingDeleteTarget.value = null;
  } finally {
    isConfirmingDelete.value = false;
  }
}

async function handleContinueActivity(log: TimeLog) {
  if (!authStore.user) return;
  await timerStore.continueFromLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    log,
  });
}

// Group historical logs by calendar day in UserPreferences.timeZone (O(N), cached until logs/tz change)
const allDayGroups = computed(() =>
  groupLogsByCalendarDay(timeLogsStore.logs, prefsStore.preferences.timeZone)
);

// Slice strictly 7 distinct calendar days per page (O(1) on page turn; off-page logs never mounted)
const feedWindow = computed(() =>
  sliceTrackerFeedWindow({
    dayGroups: allDayGroups.value,
    pageIndex: currentPageIndex.value,
    windowSizeDays: TRACKER_FEED_WINDOW_DAYS,
    totalLogsCount: timeLogsStore.logs.length,
  })
);

watch(
  () => feedWindow.value.pageIndex,
  (clamped) => {
    if (currentPageIndex.value !== clamped) {
      currentPageIndex.value = clamped;
    }
  }
);

watch(
  () => [feedWindow.value.pageIndex, feedWindow.value.newestDateKey, feedWindow.value.days.length] as const,
  ([nextPage, nextNewest, nextLen], oldVal) => {
    const oldPage = oldVal?.[0];
    const oldNewest = oldVal?.[1];
    const oldLen = oldVal?.[2] ?? 0;
    if (
      oldVal === undefined ||
      nextPage !== oldPage ||
      (oldLen === 0 && nextLen > 0) ||
      (nextPage === 0 && nextNewest !== oldNewest && oldNewest !== null)
    ) {
      expandedDayKeys.value = defaultExpandedTrackerDayKeys(feedWindow.value.days);
    }
  },
  { immediate: true }
);

function isDayExpanded(dateKey: string): boolean {
  return expandedDayKeys.value.includes(dateKey);
}

const areAllDaysExpanded = computed(() =>
  areAllTrackerDaysExpanded(feedWindow.value.days, expandedDayKeys.value)
);

function toggleAllVisibleDays() {
  expandedDayKeys.value = toggleAllTrackerDayKeys(feedWindow.value.days, expandedDayKeys.value);
}

function handleExpandedDaysUpdate(next: string | string[] | undefined) {
  if (Array.isArray(next)) {
    expandedDayKeys.value = next;
  } else if (typeof next === 'string') {
    expandedDayKeys.value = [next];
  } else {
    expandedDayKeys.value = [];
  }
}

function goToPage(nextIndex: number, scrollToTop = false) {
  const maxIndex = Math.max(0, feedWindow.value.totalPages - 1);
  const clamped = Math.min(Math.max(0, nextIndex), maxIndex);
  if (clamped === currentPageIndex.value) return;
  expandedGroupKeys.value = new Set();
  currentPageIndex.value = clamped;
  if (scrollToTop && import.meta.client) {
    feedTopRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>

<template>
  <div class="space-y-6 pb-32 md:pb-8">
    <!-- Interactive Keyboard Tour Banner (FR-2) -->
    <OnboardingSpotlightTour />

    <!-- Persistent Top Command Timer Bar (transforms into sticky bottom thumb-zone dock on mobile < 768px) -->
    <TimerCommandTimerBar />

    <!-- Dismissible Getting-Started Checklist (FR-2) -->
    <OnboardingGettingStartedChecklist />

    <!-- Manual Entry Toggle & Collapsible Form -->
    <div ref="feedTopRef" class="flex items-center justify-between">
      <div class="label-mono text-text-muted">
        {{ $t('timer.logsHeader') }} ({{ timeLogsStore.logs.length }})
      </div>
      <button
        type="button"
        data-tour="manual-log-toggle"
        class="inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3.5 text-xs font-mono text-text-primary hover:bg-bg-hover transition-colors"
        @click="showManualForm = !showManualForm"
      >
        <Plus class="h-4 w-4 text-signal" />
        <span>{{ $t('timer.manualEntryToggle') }}</span>
      </button>
    </div>

    <form
      v-if="showManualForm"
      class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 space-y-4"
      @submit.prevent="handleSaveManualLog"
    >
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="label-mono text-signal">
        {{ $t('timer.manualTitle') }}
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <input
          v-model="manualDescription"
          type="text"
          required
          :placeholder="$t('timer.descriptionPlaceholder')"
          class="sm:col-span-3 h-10 border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
        />

        <select
          :value="manualProjectId"
          class="sm:col-span-2 h-10 border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
          @change="handleManualProjectChange(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="proj in catalogStore.sortedProjects"
            :key="proj.id"
            :value="proj.id"
          >
            {{ displayProjectName(proj) }}
          </option>
        </select>

        <div class="sm:col-span-2">
          <UiDateInput
            v-model="manualDate"
            v-model:valid="isManualDateValid"
            calendar-placement="popover"
            size="md"
            :aria-label="$t('timer.manualDateLabel')"
            test-id="manual-log-date"
            @update:model-value="handleManualRangeChange"
          />
        </div>

        <input
          v-model="manualStartHM"
          type="time"
          step="1"
          required
          :aria-label="$t('timer.manualStartLabel')"
          :title="$t('timer.manualStartLabel')"
          class="tabular-telemetry sm:col-span-2 h-10 border border-border-input bg-bg-primary px-2.5 text-ui font-mono text-text-primary focus:border-signal focus:outline-none"
          @input="handleManualRangeChange"
        />

        <input
          v-model="manualEndHM"
          type="time"
          step="1"
          required
          :aria-label="$t('timer.manualStopLabel')"
          :title="$t('timer.manualStopLabel')"
          class="tabular-telemetry sm:col-span-2 h-10 border border-border-input bg-bg-primary px-2.5 text-ui font-mono text-text-primary focus:border-signal focus:outline-none"
          @input="handleManualRangeChange"
        />

        <input
          v-model="manualDurationHMS"
          type="text"
          required
          placeholder="01:00:00"
          :aria-label="$t('timer.manualDurationLabel')"
          :title="$t('timer.manualDurationLabel')"
          class="tabular-telemetry sm:col-span-1 h-10 border border-border-input bg-bg-primary px-2.5 text-ui font-mono text-text-primary focus:border-signal focus:outline-none"
          @input="handleManualDurationInput"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2.5">
          <div class="w-56">
            <UiTagMultiSelect
              v-model="manualTagIds"
              :tags="manualScopedTags"
              variant="field"
              size="sm"
              test-id="manual-log-tags-trigger"
            />
          </div>

          <select
            v-if="manualScopedTaskNodes.length > 0"
            :value="manualTaskId ?? ''"
            :aria-label="$t('timer.taskSelectorPlaceholder')"
            class="h-9 border border-border-input bg-bg-primary px-2.5 text-ui font-mono text-text-primary focus:border-signal focus:outline-none"
            @change="manualTaskId = ($event.target as HTMLSelectElement).value || undefined"
          >
            <option value="">{{ $t('timer.taskSelectorPlaceholder') }}</option>
            <option
              v-for="node in manualScopedTaskNodes"
              :key="node.task.id"
              :value="node.task.id"
            >
              {{ node.depth === 1 ? '↳ ' : node.depth === 2 ? '↳↳ ' : '' }}{{ node.task.name }}
            </option>
          </select>

          <UiBillableToggle
            v-model="manualBillable"
            variant="pill"
            test-id="manual-log-billable-toggle"
          />
        </div>

        <button
          type="submit"
          class="inline-flex h-9 items-center bg-accent px-4 text-xs font-mono uppercase text-white hover:bg-accent-hover transition-colors"
        >
          {{ $t('timer.manualSaveButton') }}
        </button>
      </div>
    </form>

    <!-- Historical TimeLogs Paginated into 7-Day Calendar Windows (NFR-1.1) -->
    <div
      v-if="timeLogsStore.loading && feedWindow.days.length === 0"
      data-testid="tracker-loading-skeleton"
      role="status"
      :aria-label="$t('timer.loadingLogs')"
      class="space-y-4"
    >
      <!-- Skeleton 7-Day Pagination Bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 border border-border-hairline bg-bg-elevated px-4 py-3">
        <div class="flex items-center gap-2.5">
          <div class="h-5 w-24 motion-safe:animate-pulse bg-bg-hover" />
          <div class="h-4 w-40 motion-safe:animate-pulse bg-bg-hover" />
          <div class="h-4 w-28 motion-safe:animate-pulse bg-bg-hover" />
        </div>
        <div class="flex items-center gap-1.5">
          <div class="h-9 w-28 motion-safe:animate-pulse border border-border-hairline bg-bg-primary" />
          <div class="h-9 w-24 motion-safe:animate-pulse border border-border-hairline bg-bg-primary" />
        </div>
      </div>

      <!-- Expanded First Day Card Skeleton -->
      <div class="border border-border-hairline bg-bg-elevated">
        <div class="flex items-center justify-between bg-bg-primary/60 px-4 py-3 border-b border-border-hairline">
          <div class="flex items-center gap-2">
            <div class="h-4 w-4 motion-safe:animate-pulse bg-bg-hover" />
            <div class="h-4 w-24 motion-safe:animate-pulse bg-bg-hover" />
            <div class="h-4 w-16 motion-safe:animate-pulse bg-bg-hover" />
          </div>
          <div class="h-4 w-24 motion-safe:animate-pulse bg-bg-hover" />
        </div>
        <ul class="divide-y divide-border-hairline">
          <li
            v-for="rowIdx in 3"
            :key="rowIdx"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="h-4 w-48 sm:w-64 motion-safe:animate-pulse bg-bg-hover" />
              <div class="h-6 w-24 motion-safe:animate-pulse bg-bg-hover" />
              <div class="h-6 w-16 motion-safe:animate-pulse bg-bg-hover" />
            </div>
            <div class="flex items-center gap-2.5">
              <div class="hidden sm:block h-4 w-24 motion-safe:animate-pulse bg-bg-hover" />
              <div class="h-5 w-16 motion-safe:animate-pulse bg-bg-hover" />
              <div class="h-8 w-8 motion-safe:animate-pulse border border-border-hairline bg-bg-primary" />
              <div class="h-8 w-8 motion-safe:animate-pulse border border-border-hairline bg-bg-primary" />
            </div>
          </li>
        </ul>
      </div>

      <!-- Collapsed Past Day Headers Skeleton -->
      <div
        v-for="dayIdx in 3"
        :key="dayIdx"
        class="flex items-center justify-between border border-border-hairline bg-bg-elevated px-4 py-3"
      >
        <div class="flex items-center gap-2">
          <div class="h-4 w-4 motion-safe:animate-pulse bg-bg-hover" />
          <div class="h-4 w-24 motion-safe:animate-pulse bg-bg-hover" />
          <div class="h-4 w-14 motion-safe:animate-pulse bg-bg-hover" />
        </div>
        <div class="h-4 w-24 motion-safe:animate-pulse bg-bg-hover" />
      </div>
    </div>

    <div
      v-else-if="feedWindow.days.length === 0"
      class="border border-border-hairline bg-bg-elevated p-8 text-center text-sm font-mono text-text-muted"
    >
      {{ $t('timer.emptyLogs') }}
    </div>

    <div v-else class="space-y-4">
      <TimerTrackerPaginationBar
        :window="feedWindow"
        :all-days-expanded="areAllDaysExpanded"
        show-day-collapse-control
        :streaming="timeLogsStore.streaming"
        :streamed-count="timeLogsStore.streamedCount"
        @navigate="goToPage($event, false)"
        @toggle-all-days="toggleAllVisibleDays"
      />

      <AccordionRoot
        type="multiple"
        :model-value="expandedDayKeys"
        class="space-y-4"
        @update:model-value="handleExpandedDaysUpdate"
      >
        <AccordionItem
          v-for="group in feedWindow.days"
          :key="group.dateKey"
          :value="group.dateKey"
          data-testid="tracker-day-group"
          class="border border-border-hairline bg-bg-elevated"
        >
          <AccordionHeader as="div">
            <AccordionTrigger
              data-testid="tracker-day-toggle"
              :aria-label="
                isDayExpanded(group.dateKey)
                  ? $t('timer.dayGroup.collapseDayAria', { date: formatDateKey(group.dateKey) })
                  : $t('timer.dayGroup.expandDayAria', { date: formatDateKey(group.dateKey) })
              "
              class="flex w-full items-center justify-between gap-3 bg-bg-primary/60 px-4 py-3 text-ui font-mono hover:bg-bg-hover/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
            >
              <span class="flex items-center gap-2.5 min-w-0">
                <ChevronDown
                  v-if="isDayExpanded(group.dateKey)"
                  class="h-4 w-4 shrink-0 text-signal"
                />
                <ChevronRight
                  v-else
                  class="h-4 w-4 shrink-0 text-signal"
                />
                <span
                  data-testid="tracker-day-date"
                  class="tabular-telemetry font-semibold text-text-primary"
                >
                  {{ formatDateKey(group.dateKey) }}
                </span>
                <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs text-text-muted">
                  {{ $t('timer.dayGroup.entriesCount', { count: group.items.length }) }}
                </span>
              </span>

              <span class="tabular-telemetry shrink-0 text-text-muted">
                {{ $t('timer.daySubtotal') }}:
                <strong class="text-text-primary">{{ formatDuration(group.totalSeconds) }}</strong>
              </span>
            </AccordionTrigger>
          </AccordionHeader>

          <AccordionContent class="border-t border-border-hairline">
            <ul class="divide-y divide-border-hairline">
          <template v-for="entryGroup in group.entryGroups" :key="entryGroup.groupKey">
            <!-- Collapsible Same-Day Summary Row (FR-5.1: count > 1, with Toggl-style bulk header editing) -->
            <li
              v-if="entryGroup.isGrouped"
              data-testid="tracker-log-group"
              class="transition-colors"
            >
              <div
                data-testid="tracker-log-group-header"
                class="group/row flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-bg-hover/50 transition-colors cursor-pointer select-none"
                :class="isGroupExpanded(entryGroup.groupKey) ? 'bg-bg-hover/30' : ''"
                @click="toggleGroupExpanded(entryGroup)"
              >
                <div class="flex flex-wrap items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    data-testid="tracker-log-group-toggle"
                    :aria-expanded="isGroupExpanded(entryGroup.groupKey)"
                    :aria-label="
                      isGroupExpanded(entryGroup.groupKey)
                        ? $t('timer.group.collapseAria', {
                            count: entryGroup.count,
                            description: entryGroup.description,
                          })
                        : $t('timer.group.expandAria', {
                            count: entryGroup.count,
                            description: entryGroup.description,
                          })
                    "
                    class="inline-flex items-center gap-1.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
                    @click.stop="toggleGroupExpanded(entryGroup)"
                  >
                    <ChevronDown
                      v-if="isGroupExpanded(entryGroup.groupKey)"
                      class="h-4 w-4 shrink-0 text-signal"
                    />
                    <ChevronRight
                      v-else
                      class="h-4 w-4 shrink-0 text-signal"
                    />

                    <span
                      data-testid="tracker-log-group-count"
                      :title="$t('timer.group.entriesBadgeTitle', { count: entryGroup.count })"
                      class="tabular-telemetry inline-flex h-6 min-w-6 items-center justify-center border border-signal/40 bg-signal-soft px-2 text-xs font-mono font-semibold text-signal"
                    >
                      {{ entryGroup.count }}
                    </span>
                  </button>

                  <TimerInlineDescriptionInput
                    :value="entryGroup.description"
                    stop-propagation
                    test-id="tracker-group-description-trigger"
                    @save="handleGroupDescriptionSave(entryGroup, $event)"
                  />

                  <TimerProjectTaskPopover
                    :project-id="entryGroup.projectId"
                    :project-name-snapshot="entryGroup.projectNameSnapshot"
                    :project-color-snapshot="entryGroup.projectColorSnapshot"
                    :task-id="entryGroup.taskId"
                    :task-name-snapshot="entryGroup.taskNameSnapshot"
                    stop-propagation
                    test-id="tracker-group-project-trigger"
                    @select="handleGroupProjectTaskSave(entryGroup, $event)"
                  />

                  <UiTagMultiSelect
                    :model-value="entryGroup.tagIds"
                    :tags="catalogStore.getTagsForProject(entryGroup.projectId)"
                    variant="row"
                    stop-propagation
                    test-id="tracker-group-tags-trigger"
                    @update:model-value="handleGroupTagsSave(entryGroup, $event)"
                  />
                </div>

                <div class="flex items-center gap-2.5 shrink-0">
                  <UiBillableToggle
                    :model-value="entryGroup.allBillable"
                    :partial="entryGroup.isBillable && !entryGroup.allBillable"
                    variant="row-icon"
                    stop-propagation
                    test-id="tracker-group-billable-toggle"
                    @update:model-value="handleGroupBillableSave(entryGroup, $event)"
                  />

                  <span class="tabular-telemetry hidden sm:inline text-ui font-mono text-text-muted">
                    {{ formatTime(entryGroup.earliestStartTime) }} – {{ formatTime(entryGroup.latestEndTime) }}
                  </span>
                  <span
                    data-testid="tracker-log-group-duration"
                    class="tabular-telemetry px-1.5 py-0.5 font-mono text-sm font-semibold text-text-primary"
                  >
                    {{ formatDuration(entryGroup.totalSeconds) }}
                  </span>

                  <button
                    type="button"
                    data-testid="tracker-log-group-continue"
                    class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/60 hover:text-signal transition-colors"
                    :aria-label="$t('timer.continueAria', { description: entryGroup.description })"
                    :title="$t('timer.continueButton')"
                    @click.stop="handleContinueActivity(entryGroup.items[0]!)"
                  >
                    <Play class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    data-testid="tracker-log-group-delete"
                    class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-destructive transition-colors"
                    :aria-label="$t('timer.group.deleteGroupAria', { count: entryGroup.count })"
                    :title="$t('timer.group.deleteGroupAria', { count: entryGroup.count })"
                    @click.stop="requestDeleteGroup(entryGroup)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <!-- Expanded Individual TimeLog Executions -->
              <ul
                v-if="isGroupExpanded(entryGroup.groupKey)"
                data-testid="tracker-log-group-items"
                class="divide-y divide-border-hairline border-t border-border-hairline bg-bg-primary/40"
              >
                <li
                  v-for="(log, subIdx) in entryGroup.items"
                  :key="log.id"
                  data-testid="tracker-log-row"
                  data-subrow="true"
                  class="group/row pl-9 sm:pl-11 pr-4 py-3 hover:bg-bg-hover/50 transition-colors"
                >
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                      <CornerDownRight class="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs font-mono text-text-muted">
                        #{{ entryGroup.count - subIdx }}
                      </span>

                      <TimerInlineDescriptionInput
                        :value="log.description"
                        compact
                        @save="handleSingleDescriptionSave(log, $event)"
                      />

                      <TimerProjectTaskPopover
                        :project-id="log.projectId"
                        :project-name-snapshot="log.projectNameSnapshot"
                        :project-color-snapshot="log.projectColorSnapshot"
                        :task-id="log.taskId"
                        :task-name-snapshot="log.taskNameSnapshot"
                        @select="handleSingleProjectTaskSave(log, $event)"
                      />

                      <UiTagMultiSelect
                        :model-value="log.tagIds"
                        :tags="catalogStore.getTagsForProject(log.projectId)"
                        variant="row"
                        @update:model-value="handleSingleTagsSave(log, $event)"
                      />
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <UiBillableToggle
                        :model-value="log.isBillable"
                        variant="row-icon"
                        @update:model-value="handleSingleBillableSave(log, $event)"
                      />

                      <TimerTimeRangePopover
                        :start-time="log.startTime"
                        :end-time="log.endTime"
                        :duration-seconds="log.durationSeconds"
                        :date-key="group.dateKey"
                        compact-duration
                        @save="handleSingleTimeRangeSave(log, $event)"
                      />

                      <button
                        type="button"
                        data-testid="tracker-log-continue"
                        class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/60 hover:text-signal transition-colors"
                        :aria-label="$t('timer.continueAria', { description: log.description })"
                        :title="$t('timer.continueButton')"
                        @click="handleContinueActivity(log)"
                      >
                        <Play class="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        data-testid="tracker-log-delete"
                        class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-destructive transition-colors"
                        :aria-label="$t('timer.deleteButton')"
                        @click="requestDeleteLog(log)"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
            </li>

            <!-- Standalone Single TimeLog Row (count === 1) -->
            <li
              v-else
              data-testid="tracker-log-row"
              class="group/row px-4 py-3.5 hover:bg-bg-hover/50 transition-colors"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2.5 min-w-0">
                  <TimerInlineDescriptionInput
                    :value="entryGroup.items[0]!.description"
                    @save="handleSingleDescriptionSave(entryGroup.items[0]!, $event)"
                  />

                  <TimerProjectTaskPopover
                    :project-id="entryGroup.items[0]!.projectId"
                    :project-name-snapshot="entryGroup.items[0]!.projectNameSnapshot"
                    :project-color-snapshot="entryGroup.items[0]!.projectColorSnapshot"
                    :task-id="entryGroup.items[0]!.taskId"
                    :task-name-snapshot="entryGroup.items[0]!.taskNameSnapshot"
                    @select="handleSingleProjectTaskSave(entryGroup.items[0]!, $event)"
                  />

                  <UiTagMultiSelect
                    :model-value="entryGroup.items[0]!.tagIds"
                    :tags="catalogStore.getTagsForProject(entryGroup.items[0]!.projectId)"
                    variant="row"
                    @update:model-value="handleSingleTagsSave(entryGroup.items[0]!, $event)"
                  />
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <UiBillableToggle
                    :model-value="entryGroup.items[0]!.isBillable"
                    variant="row-icon"
                    @update:model-value="handleSingleBillableSave(entryGroup.items[0]!, $event)"
                  />

                  <TimerTimeRangePopover
                    :start-time="entryGroup.items[0]!.startTime"
                    :end-time="entryGroup.items[0]!.endTime"
                    :duration-seconds="entryGroup.items[0]!.durationSeconds"
                    :date-key="group.dateKey"
                    @save="handleSingleTimeRangeSave(entryGroup.items[0]!, $event)"
                  />

                  <button
                    type="button"
                    data-testid="tracker-log-continue"
                    class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/60 hover:text-signal transition-colors"
                    :aria-label="$t('timer.continueAria', { description: entryGroup.items[0]!.description })"
                    :title="$t('timer.continueButton')"
                    @click="handleContinueActivity(entryGroup.items[0]!)"
                  >
                    <Play class="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    data-testid="tracker-log-delete"
                    class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-destructive transition-colors"
                    :aria-label="$t('timer.deleteButton')"
                    @click="requestDeleteLog(entryGroup.items[0]!)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          </template>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>

      <TimerTrackerPaginationBar
        v-if="feedWindow.totalPages > 1"
        :window="feedWindow"
        compact
        @navigate="goToPage($event, true)"
      />
    </div>

    <UiConfirmDialog
      :open="Boolean(pendingDeleteTarget)"
      :title="confirmDialogTitle"
      :description="confirmDialogDescription"
      :detail="confirmDialogDetail"
      :loading="isConfirmingDelete"
      test-id="tracker-delete-confirm-dialog"
      @update:open="(open) => { if (!open && !isConfirmingDelete) pendingDeleteTarget = null; }"
      @confirm="confirmDeletePending"
      @cancel="pendingDeleteTarget = null"
    />
  </div>
</template>
