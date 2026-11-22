<script setup lang="ts">
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import { formatHMS, parseHMS, toDateKey } from '~/domain/duration';
import { UNASSIGNED_PROJECT_ID, applyProjectSwitch } from '~/domain/invariants';
import {
  TRACKER_FEED_WINDOW_DAYS,
  findPageIndexForDateKey,
  groupLogsByCalendarDay,
  sliceTrackerFeedWindow,
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
const { formatDuration, formatTime } = useFormat(() => prefsStore.preferences);

// 7-day windowed pagination state (NFR-1.1)
const currentPageIndex = ref(0);
const feedTopRef = ref<HTMLElement | null>(null);

// Manual Time Log form state
const showManualForm = ref(false);
const manualDescription = ref('');
const manualProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);
const manualTagIds = ref<EntityId[]>([]);
const manualBillable = ref(false);
const manualDate = ref(toDateKey(new Date(), 'UTC'));
const manualStartHM = ref('09:00');
const manualDurationHMS = ref('01:00:00');

// Same-day grouped accordion state (FR-5.1)
const expandedGroupKeys = ref<Set<string>>(new Set());

// Inline Edit state
const editingLogId = ref<EntityId | null>(null);
const editDescription = ref('');
const editProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);
const editTagIds = ref<EntityId[]>([]);
const editBillable = ref(false);
const editDurationHMS = ref('00:30:00');

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timeLogsStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    onboardingStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
  manualDate.value = toDateKey(new Date(), prefsStore.preferences.timeZone);
});

const manualScopedTags = computed(() =>
  catalogStore.getTagsForProject(manualProjectId.value)
);

const editScopedTags = computed(() =>
  catalogStore.getTagsForProject(editProjectId.value)
);

function displayProjectName(project: Project | undefined, fallbackSnapshot?: string): string {
  if (project?.systemKey === 'unassigned') return t('catalog.unassigned');
  if (project) return project.name;
  return fallbackSnapshot || t('catalog.unassigned');
}

function displayTaskName(taskId?: EntityId, fallbackSnapshot?: string): string | null {
  if (!taskId && !fallbackSnapshot) return null;
  const liveLabel = taskId ? catalogStore.getTaskHierarchicalLabel(taskId) : '';
  return liveLabel || fallbackSnapshot || null;
}

function isGroupExpanded(groupKey: string): boolean {
  return expandedGroupKeys.value.has(groupKey);
}

function toggleGroupExpanded(entryGroup: TrackerLogGroup) {
  if (!entryGroup.isGrouped) return;
  const next = new Set(expandedGroupKeys.value);
  if (next.has(entryGroup.groupKey)) {
    next.delete(entryGroup.groupKey);
    if (
      editingLogId.value &&
      entryGroup.items.some((item) => item.id === editingLogId.value)
    ) {
      editingLogId.value = null;
    }
  } else {
    next.add(entryGroup.groupKey);
  }
  expandedGroupKeys.value = next;
}

function handleManualProjectChange(nextId: EntityId) {
  const proj = catalogStore.getProjectById(nextId);
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

function toggleManualTag(tagId: EntityId) {
  if (manualTagIds.value.includes(tagId)) {
    manualTagIds.value = manualTagIds.value.filter((id) => id !== tagId);
  } else {
    manualTagIds.value = [...manualTagIds.value, tagId];
  }
}

async function handleSaveManualLog() {
  if (!authStore.user) return;
  const durSeconds = parseHMS(manualDurationHMS.value);
  if (durSeconds === null || durSeconds <= 0) return;

  const startIso = new Date(`${manualDate.value}T${manualStartHM.value}:00`).toISOString();
  const endIso = new Date(Date.parse(startIso) + durSeconds * 1000).toISOString();

  const created = await timeLogsStore.createTimeLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    description: manualDescription.value.trim() || 'Manual entry',
    projectId: manualProjectId.value,
    tagIds: manualTagIds.value,
    isBillable: manualBillable.value,
    startTimeUTC: startIso,
    endTimeUTC: endIso,
    durationSeconds: durSeconds,
    source: 'manual',
  });

  currentPageIndex.value = findPageIndexForDateKey(
    allDayGroups.value,
    toDateKey(created.startTime, prefsStore.preferences.timeZone),
    TRACKER_FEED_WINDOW_DAYS
  );

  manualDescription.value = '';
  manualDurationHMS.value = '01:00:00';
  showManualForm.value = false;
}

function startInlineEdit(log: TimeLog) {
  editingLogId.value = log.id;
  editDescription.value = log.description;
  editProjectId.value = log.projectId;
  editTagIds.value = [...log.tagIds];
  editBillable.value = log.isBillable;
  editDurationHMS.value = formatHMS(log.durationSeconds);
}

function handleEditProjectChange(nextId: EntityId) {
  const proj = catalogStore.getProjectById(nextId);
  if (!proj) {
    editProjectId.value = nextId;
    editTagIds.value = [];
    return;
  }
  const switched = applyProjectSwitch({
    nextProject: proj,
    currentTagIds: editTagIds.value,
    allTags: catalogStore.tags,
  });
  editProjectId.value = switched.projectId;
  editTagIds.value = switched.tagIds;
  editBillable.value = switched.isBillable;
}

function toggleEditTag(tagId: EntityId) {
  if (editTagIds.value.includes(tagId)) {
    editTagIds.value = editTagIds.value.filter((id) => id !== tagId);
  } else {
    editTagIds.value = [...editTagIds.value, tagId];
  }
}

async function saveInlineEdit(log: TimeLog) {
  if (!authStore.user) return;
  const durSeconds = parseHMS(editDurationHMS.value) ?? log.durationSeconds;
  const endIso = new Date(Date.parse(log.startTime) + durSeconds * 1000).toISOString();

  await timeLogsStore.updateTimeLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logId: log.id,
    description: editDescription.value,
    projectId: editProjectId.value,
    tagIds: editTagIds.value,
    isBillable: editBillable.value,
    startTimeUTC: log.startTime,
    endTimeUTC: endIso,
    durationSeconds: durSeconds,
  });

  editingLogId.value = null;
}

async function handleDeleteLog(logId: EntityId) {
  if (!authStore.user) return;
  if (editingLogId.value === logId) {
    editingLogId.value = null;
  }
  await timeLogsStore.deleteTimeLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logId,
  });
}

async function handleDeleteGroup(entryGroup: TrackerLogGroup) {
  if (!authStore.user) return;
  const ids = entryGroup.items.map((item) => item.id);
  if (editingLogId.value && ids.includes(editingLogId.value)) {
    editingLogId.value = null;
  }
  if (expandedGroupKeys.value.has(entryGroup.groupKey)) {
    const next = new Set(expandedGroupKeys.value);
    next.delete(entryGroup.groupKey);
    expandedGroupKeys.value = next;
  }
  await timeLogsStore.deleteTimeLogs({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logIds: ids,
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

function goToPage(nextIndex: number, scrollToTop = false) {
  const maxIndex = Math.max(0, feedWindow.value.totalPages - 1);
  const clamped = Math.min(Math.max(0, nextIndex), maxIndex);
  if (clamped === currentPageIndex.value) return;
  editingLogId.value = null;
  expandedGroupKeys.value = new Set();
  currentPageIndex.value = clamped;
  if (scrollToTop && import.meta.client) {
    feedTopRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>

<template>
  <div class="space-y-6 pb-24 md:pb-6">
    <!-- Interactive Keyboard Tour Banner (FR-2) -->
    <OnboardingSpotlightTour />

    <!-- Persistent Top Command Timer Bar (transforms into sticky bottom thumb-zone dock on mobile < 768px) -->
    <TimerCommandTimerBar />

    <!-- Dismissible Getting-Started Telemetry Checklist (FR-2) -->
    <OnboardingGettingStartedChecklist />

    <!-- Manual Entry Toggle & Collapsible Form -->
    <div ref="feedTopRef" class="flex items-center justify-between">
      <div class="text-xs font-mono uppercase tracking-wider text-text-muted">
        {{ $t('timer.logsHeader') }} ({{ timeLogsStore.logs.length }})
      </div>
      <button
        type="button"
        data-tour="manual-log-toggle"
        class="inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-mono text-text-primary hover:bg-bg-hover transition-colors"
        @click="showManualForm = !showManualForm"
      >
        <Plus class="h-3.5 w-3.5 text-accent" />
        <span>{{ $t('timer.manualEntryToggle') }}</span>
      </button>
    </div>

    <form
      v-if="showManualForm"
      class="border border-border-hairline bg-bg-elevated p-4 space-y-4"
      @submit.prevent="handleSaveManualLog"
    >
      <div class="text-xs font-mono uppercase tracking-wider text-accent">
        {{ $t('timer.manualTitle') }}
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <input
          v-model="manualDescription"
          type="text"
          required
          :placeholder="$t('timer.descriptionPlaceholder')"
          class="sm:col-span-4 h-9 border border-border-hairline bg-bg-primary px-3 text-xs text-text-primary focus:border-accent focus:outline-none"
        />

        <select
          :value="manualProjectId"
          class="sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
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

        <input
          v-model="manualDate"
          type="date"
          required
          :aria-label="$t('timer.manualDateLabel')"
          class="tabular-telemetry sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        />

        <input
          v-model="manualStartHM"
          type="time"
          required
          :aria-label="$t('timer.manualStartLabel')"
          class="tabular-telemetry sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        />

        <input
          v-model="manualDurationHMS"
          type="text"
          required
          placeholder="01:00:00"
          :aria-label="$t('timer.manualDurationLabel')"
          class="tabular-telemetry sm:col-span-2 h-9 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="tag in manualScopedTags"
            :key="tag.id"
            type="button"
            class="border px-2 py-0.5 text-[11px] font-mono transition-colors"
            :class="
              manualTagIds.includes(tag.id)
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border-hairline bg-bg-primary text-text-muted'
            "
            @click="toggleManualTag(tag.id)"
          >
            #{{ tag.name }}
          </button>

          <label class="ml-2 inline-flex items-center gap-1.5 text-xs font-mono text-text-muted cursor-pointer">
            <input v-model="manualBillable" type="checkbox" class="accent-accent" />
            <span>{{ $t('timer.billableToggle') }}</span>
          </label>
        </div>

        <button
          type="submit"
          class="inline-flex h-8 items-center bg-accent px-4 text-xs font-mono uppercase text-white hover:bg-accent-hover transition-colors"
        >
          {{ $t('timer.manualSaveButton') }}
        </button>
      </div>
    </form>

    <!-- Historical TimeLogs Paginated into 7-Day Calendar Windows (NFR-1.1) -->
    <div
      v-if="feedWindow.days.length === 0"
      class="border border-border-hairline bg-bg-elevated p-8 text-center text-xs font-mono text-text-muted"
    >
      {{ $t('timer.emptyLogs') }}
    </div>

    <div v-else class="space-y-4">
      <TimerTrackerPaginationBar
        :window="feedWindow"
        @navigate="goToPage($event, false)"
      />

      <div
        v-for="group in feedWindow.days"
        :key="group.dateKey"
        data-testid="tracker-day-group"
        class="border border-border-hairline bg-bg-elevated"
      >
        <div class="flex items-center justify-between border-b border-border-hairline bg-bg-primary/60 px-4 py-2 text-xs font-mono">
          <span class="tabular-telemetry font-semibold text-text-primary">
            {{ group.dateKey }}
          </span>
          <span class="tabular-telemetry text-text-muted">
            {{ $t('timer.daySubtotal') }}:
            <strong class="text-text-primary">{{ formatDuration(group.totalSeconds) }}</strong>
          </span>
        </div>

        <ul class="divide-y divide-border-hairline">
          <template v-for="entryGroup in group.entryGroups" :key="entryGroup.groupKey">
            <!-- Collapsible Same-Day Summary Row (FR-5.1: count > 1) -->
            <li
              v-if="entryGroup.isGrouped"
              data-testid="tracker-log-group"
              class="transition-colors"
            >
              <div
                data-testid="tracker-log-group-header"
                class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-bg-hover/50 transition-colors cursor-pointer select-none"
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
                    class="inline-flex items-center gap-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    @click.stop="toggleGroupExpanded(entryGroup)"
                  >
                    <ChevronDown
                      v-if="isGroupExpanded(entryGroup.groupKey)"
                      class="h-3.5 w-3.5 shrink-0 text-accent"
                    />
                    <ChevronRight
                      v-else
                      class="h-3.5 w-3.5 shrink-0 text-accent"
                    />

                    <span
                      data-testid="tracker-log-group-count"
                      :title="$t('timer.group.entriesBadgeTitle', { count: entryGroup.count })"
                      class="tabular-telemetry inline-flex h-5 min-w-5 items-center justify-center border border-accent/40 bg-accent/10 px-1.5 text-[11px] font-mono font-semibold text-accent"
                    >
                      {{ entryGroup.count }}
                    </span>

                    <span class="text-sm font-medium text-text-primary">
                      {{ entryGroup.description }}
                    </span>
                  </button>

                  <span class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs">
                    <span
                      class="h-2 w-2"
                      :style="{ backgroundColor: entryGroup.projectColorSnapshot }"
                    />
                    <span>
                      {{
                        displayProjectName(
                          catalogStore.getProjectById(entryGroup.projectId),
                          entryGroup.projectNameSnapshot
                        )
                      }}
                    </span>
                  </span>

                  <span
                    v-if="displayTaskName(entryGroup.taskId, entryGroup.taskNameSnapshot)"
                    class="inline-flex items-center gap-1 border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[11px] font-mono text-text-muted"
                  >
                    <CheckSquare class="h-3 w-3 text-accent" />
                    <span>{{ displayTaskName(entryGroup.taskId, entryGroup.taskNameSnapshot) }}</span>
                  </span>

                  <span
                    v-for="(tagName, idx) in entryGroup.tagNamesSnapshot"
                    :key="idx"
                    class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[11px] font-mono text-text-muted"
                  >
                    #{{ tagName }}
                  </span>

                  <span
                    v-if="entryGroup.isBillable"
                    class="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                  >
                    $
                  </span>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <span class="tabular-telemetry hidden sm:inline text-xs font-mono text-text-muted">
                    {{ formatTime(entryGroup.earliestStartTime) }} – {{ formatTime(entryGroup.latestEndTime) }}
                  </span>
                  <span
                    data-testid="tracker-log-group-duration"
                    class="tabular-telemetry font-mono text-sm font-semibold text-text-primary"
                  >
                    {{ formatDuration(entryGroup.totalSeconds) }}
                  </span>

                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="tracker-log-group-delete"
                      class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-red-400 transition-colors"
                      :aria-label="$t('timer.group.deleteGroupAria', { count: entryGroup.count })"
                      :title="$t('timer.group.deleteGroupAria', { count: entryGroup.count })"
                      @click.stop="handleDeleteGroup(entryGroup)"
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
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
                  class="pl-9 sm:pl-11 pr-4 py-2.5 hover:bg-bg-hover/50 transition-colors"
                >
                  <TimerTrackerLogInlineEditor
                    v-if="editingLogId === log.id"
                    v-model:description="editDescription"
                    v-model:is-billable="editBillable"
                    v-model:duration-h-m-s="editDurationHMS"
                    :project-id="editProjectId"
                    :tag-ids="editTagIds"
                    :projects="catalogStore.sortedProjects"
                    :scoped-tags="editScopedTags"
                    @change-project="handleEditProjectChange"
                    @toggle-tag="toggleEditTag"
                    @save="saveInlineEdit(log)"
                    @cancel="editingLogId = null"
                  />

                  <div v-else class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                      <CornerDownRight class="h-3 w-3 shrink-0 text-text-muted" />
                      <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                        #{{ entryGroup.count - subIdx }}
                      </span>
                      <span class="text-xs sm:text-sm text-text-primary">
                        {{ log.description }}
                      </span>
                      <span
                        v-if="log.isBillable"
                        class="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                      >
                        $
                      </span>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                      <span class="tabular-telemetry text-xs font-mono text-text-muted">
                        {{ formatTime(log.startTime) }} – {{ formatTime(log.endTime) }}
                      </span>
                      <span class="tabular-telemetry font-mono text-xs sm:text-sm font-medium text-text-primary">
                        {{ formatDuration(log.durationSeconds) }}
                      </span>

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary transition-colors"
                          :aria-label="$t('timer.editButton')"
                          @click="startInlineEdit(log)"
                        >
                          <Edit3 class="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-red-400 transition-colors"
                          :aria-label="$t('timer.deleteButton')"
                          @click="handleDeleteLog(log.id)"
                        >
                          <Trash2 class="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </li>

            <!-- Standalone Single TimeLog Row (count === 1) -->
            <li
              v-else
              data-testid="tracker-log-row"
              class="px-4 py-3 hover:bg-bg-hover/50 transition-colors"
            >
              <TimerTrackerLogInlineEditor
                v-if="editingLogId === entryGroup.items[0]!.id"
                v-model:description="editDescription"
                v-model:is-billable="editBillable"
                v-model:duration-h-m-s="editDurationHMS"
                :project-id="editProjectId"
                :tag-ids="editTagIds"
                :projects="catalogStore.sortedProjects"
                :scoped-tags="editScopedTags"
                @change-project="handleEditProjectChange"
                @toggle-tag="toggleEditTag"
                @save="saveInlineEdit(entryGroup.items[0]!)"
                @cancel="editingLogId = null"
              />

              <div v-else class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2.5 min-w-0">
                  <span class="text-sm font-medium text-text-primary">
                    {{ entryGroup.items[0]!.description }}
                  </span>

                  <span class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs">
                    <span
                      class="h-2 w-2"
                      :style="{ backgroundColor: entryGroup.items[0]!.projectColorSnapshot }"
                    />
                    <span>
                      {{
                        displayProjectName(
                          catalogStore.getProjectById(entryGroup.items[0]!.projectId),
                          entryGroup.items[0]!.projectNameSnapshot
                        )
                      }}
                    </span>
                  </span>

                  <span
                    v-if="displayTaskName(entryGroup.items[0]!.taskId, entryGroup.items[0]!.taskNameSnapshot)"
                    class="inline-flex items-center gap-1 border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[11px] font-mono text-text-muted"
                  >
                    <CheckSquare class="h-3 w-3 text-accent" />
                    <span>{{ displayTaskName(entryGroup.items[0]!.taskId, entryGroup.items[0]!.taskNameSnapshot) }}</span>
                  </span>

                  <span
                    v-for="(tagName, idx) in entryGroup.items[0]!.tagNamesSnapshot"
                    :key="idx"
                    class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[11px] font-mono text-text-muted"
                  >
                    #{{ tagName }}
                  </span>

                  <span
                    v-if="entryGroup.items[0]!.isBillable"
                    class="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                  >
                    $
                  </span>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <span class="tabular-telemetry hidden sm:inline text-xs font-mono text-text-muted">
                    {{ formatTime(entryGroup.items[0]!.startTime) }} – {{ formatTime(entryGroup.items[0]!.endTime) }}
                  </span>
                  <span class="tabular-telemetry font-mono text-sm font-semibold text-text-primary">
                    {{ formatDuration(entryGroup.items[0]!.durationSeconds) }}
                  </span>

                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary transition-colors"
                      :aria-label="$t('timer.editButton')"
                      @click="startInlineEdit(entryGroup.items[0]!)"
                    >
                      <Edit3 class="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-red-400 transition-colors"
                      :aria-label="$t('timer.deleteButton')"
                      @click="handleDeleteLog(entryGroup.items[0]!.id)"
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </template>
        </ul>
      </div>

      <TimerTrackerPaginationBar
        v-if="feedWindow.totalPages > 1"
        :window="feedWindow"
        compact
        @navigate="goToPage($event, true)"
      />
    </div>
  </div>
</template>
