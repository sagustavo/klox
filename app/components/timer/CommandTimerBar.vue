<script setup lang="ts">
import {
  AlertCircle,
  Check,
  Play,
  Square,
  X,
} from 'lucide-vue-next';
import {
  formatHMS,
  resolveAdjustedTimerStartUtc,
  shiftTimerStartByMinutes,
  toDateKey,
  toLocalTimeInputValue,
} from '~/domain/duration';
import { publishDomainEvent } from '~/domain/events';
import type { AiAutofillPrediction, RecallTemplate } from '~/domain/recall';
import type { EntityId } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const timerStore = useTimerStore();
const timeLogsStore = useTimeLogsStore();
const { formatTime } = useFormat(() => prefsStore.preferences);

const descriptionInputRef = ref<HTMLInputElement | null>(null);
const liveStartTimeInputRef = ref<HTMLInputElement | null>(null);
const showRecallDropdown = ref(false);
const highlightedRecallIdx = ref(-1);

// Live ActiveTimer startTimeUTC backdating / adjustment state (FR-5.2)
const showStartAdjustPopover = ref(false);
const draftStartDateKey = ref('');
const isDraftStartDateValid = ref(true);
const draftStartTimeHMS = ref('');

const aiLoading = ref(false);
const aiErrorCode = ref<string | null>(null);

const { topMatches } = useTaskRecall(
  () => timeLogsStore.logs,
  toRef(timerStore, 'description')
);

const scopedTags = computed(() =>
  catalogStore.getTagsForProject(timerStore.projectId)
);

function handleProjectTaskSelect(payload: { projectId: EntityId; taskId: EntityId | null }) {
  if (payload.projectId !== timerStore.projectId) {
    timerStore.selectProject(payload.projectId);
  }
  timerStore.selectTask(payload.taskId ?? undefined);
}

function focusDescription() {
  descriptionInputRef.value?.focus();
  showRecallDropdown.value = topMatches.value.length > 0;
  highlightedRecallIdx.value = -1;
}

function closeMenusAndBlur() {
  showRecallDropdown.value = false;
  showStartAdjustPopover.value = false;
  highlightedRecallIdx.value = -1;
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

const activeTimeZone = computed(() => prefsStore.preferences.timeZone || 'UTC');

const draftAdjustedPreview = computed(() => {
  if (
    !showStartAdjustPopover.value ||
    !isDraftStartDateValid.value ||
    !draftStartDateKey.value ||
    !draftStartTimeHMS.value
  ) {
    return null;
  }
  return resolveAdjustedTimerStartUtc({
    dateKey: draftStartDateKey.value,
    startTimeInput: draftStartTimeHMS.value,
    timeZone: activeTimeZone.value,
  });
});

function syncDraftFromActiveTimer() {
  if (!timerStore.activeTimer) return;
  const tz = activeTimeZone.value;
  draftStartDateKey.value = toDateKey(timerStore.activeTimer.startTimeUTC, tz);
  isDraftStartDateValid.value = true;
  draftStartTimeHMS.value = toLocalTimeInputValue(
    timerStore.activeTimer.startTimeUTC,
    tz,
    true
  );
}

function toggleStartAdjustPopover() {
  if (!timerStore.isRunning || !timerStore.activeTimer) return;
  if (showStartAdjustPopover.value) {
    showStartAdjustPopover.value = false;
    return;
  }
  showRecallDropdown.value = false;
  syncDraftFromActiveTimer();
  showStartAdjustPopover.value = true;
  nextTick(() => {
    liveStartTimeInputRef.value?.focus();
  });
}

async function handleQuickShiftMinutes(deltaMinutes: number) {
  if (!authStore.user || !timerStore.activeTimer) return;
  const nextUtc = shiftTimerStartByMinutes(timerStore.activeTimer.startTimeUTC, deltaMinutes);
  if (!nextUtc) return;
  await timerStore.updateActiveTimerStart({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    startTimeUTC: nextUtc,
  });
  syncDraftFromActiveTimer();
}

async function handleApplyAdjustedStart() {
  if (!authStore.user || !timerStore.activeTimer) return;
  const resolved = resolveAdjustedTimerStartUtc({
    dateKey: draftStartDateKey.value,
    startTimeInput: draftStartTimeHMS.value,
    timeZone: activeTimeZone.value,
  });
  if (!resolved) return;
  await timerStore.updateActiveTimerStart({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    startTimeUTC: resolved.startTimeUTC,
  });
  showStartAdjustPopover.value = false;
}

watch(
  () => timerStore.isRunning,
  (running) => {
    if (!running) {
      showStartAdjustPopover.value = false;
    }
  }
);

function selectRecallTemplate(tpl: RecallTemplate) {
  timerStore.description = tpl.description;
  timerStore.selectProject(tpl.projectId);
  const validSet = new Set(catalogStore.getTagsForProject(tpl.projectId).map((tag) => tag.id));
  timerStore.tagIds = tpl.tagIds.filter((id) => validSet.has(id));
  timerStore.isBillable = tpl.isBillable;
  showRecallDropdown.value = false;
  highlightedRecallIdx.value = -1;

  publishDomainEvent({
    type: 'RecallTemplateSelected',
    at: new Date().toISOString(),
  });
}

function handleDescriptionKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' && topMatches.value.length > 0) {
    e.preventDefault();
    showRecallDropdown.value = true;
    highlightedRecallIdx.value =
      (highlightedRecallIdx.value + 1) % topMatches.value.length;
    return;
  }
  if (e.key === 'ArrowUp' && topMatches.value.length > 0) {
    e.preventDefault();
    showRecallDropdown.value = true;
    highlightedRecallIdx.value =
      highlightedRecallIdx.value <= 0
        ? topMatches.value.length - 1
        : highlightedRecallIdx.value - 1;
    return;
  }
  if (e.key === 'Enter') {
    if (showRecallDropdown.value && highlightedRecallIdx.value >= 0) {
      e.preventDefault();
      const chosen = topMatches.value[highlightedRecallIdx.value];
      if (chosen) selectRecallTemplate(chosen);
      return;
    }
    e.preventDefault();
    showRecallDropdown.value = false;
    handlePrimaryAction();
    return;
  }
  if (e.key === 'Tab') {
    showRecallDropdown.value = false;
  }
}

async function triggerAiAutofill() {
  aiErrorCode.value = null;
  if (!timerStore.description.trim()) {
    aiErrorCode.value = 'AI_INVALID_INPUT';
    return;
  }

  aiLoading.value = true;
  try {
    const token = await authStore.getIdToken();
    const res = await $fetch<AiAutofillPrediction>('/api/ai/autofill', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: {
        description: timerStore.description,
        projects: catalogStore.projects,
        tags: catalogStore.tags,
        isDemo: authStore.isDemoMode,
      },
    });

    timerStore.selectProject(res.projectId);
    const validIds = new Set(
      catalogStore.getTagsForProject(res.projectId).map((tag) => tag.id)
    );
    timerStore.tagIds = (res.tagIds ?? []).filter((id) => validIds.has(id));
    timerStore.isBillable = Boolean(res.isBillable);

    publishDomainEvent({
      type: 'AiAutofillUsed',
      at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const code =
      (err as { data?: { data?: { code?: string }; statusMessage?: string } })?.data?.data?.code ||
      (err as { data?: { statusMessage?: string } })?.data?.statusMessage ||
      'AI_UNAVAILABLE';
    aiErrorCode.value = code;
  } finally {
    aiLoading.value = false;
  }
}

async function handlePrimaryAction() {
  if (!authStore.user) return;
  showRecallDropdown.value = false;
  showStartAdjustPopover.value = false;

  if (timerStore.isRunning) {
    await timerStore.stopTimer({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
    });
  } else {
    await timerStore.startTimer({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
    });
  }
}

const activeClockTitle = computed(() => {
  if (!timerStore.activeTimer) return t('timer.liveStart.adjustTooltip');
  const started = t('timer.liveStart.startedAt', {
    time: formatTime(timerStore.activeTimer.startTimeUTC),
  });
  return `${started} · ${t('timer.liveStart.adjustTooltip')}`;
});

/**
 * Global keyboard shortcuts (GEMINI.md §3.2):
 * Guarded so single-key shortcuts (`N`, `S`) do NOT fire while focused inside INPUT, TEXTAREA, or SELECT.
 * `Cmd+I` / `Ctrl+I` and `Esc` work globally.
 */
function handleGlobalKeydown(e: KeyboardEvent) {
  if (document.querySelector('[role="alertdialog"], [role="dialog"]')) {
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    triggerAiAutofill();
    return;
  }

  if (e.key === 'Escape') {
    closeMenusAndBlur();
    return;
  }

  const active = document.activeElement;
  const isEditable =
    active instanceof HTMLElement &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable);

  if (isEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    focusDescription();
  } else if (e.key.toLowerCase() === 's') {
    if (timerStore.isRunning && authStore.user) {
      e.preventDefault();
      timerStore.stopTimer({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
      });
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div
    class="relative border bg-bg-elevated px-3 py-2 sm:px-4 sm:py-2.5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:border-x-0 max-md:border-b-0 max-md:border-t max-md:bg-bg-elevated/95 max-md:backdrop-blur-md max-md:pt-2 max-md:pb-[max(0.625rem,env(safe-area-inset-bottom))] max-md:shadow-2xl"
    :class="
      timerStore.isRunning || aiLoading
        ? 'border-signal/50 glow-signal'
        : 'border-border-hairline'
    "
  >
    <!-- Top 2px Orbital Signal Track: sweeping scan on AI Auto-Fill (⌘I), steady glow while running -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden"
      aria-hidden="true"
    >
      <div v-if="aiLoading" class="signal-line animate-scan h-full w-full" />
      <div v-else-if="timerStore.isRunning" class="signal-line h-full w-full" />
    </div>
    <span v-if="aiLoading" role="status" aria-live="polite" class="sr-only">
      {{ $t('timer.aiLoading') }}
    </span>

    <div
      v-if="aiErrorCode"
      role="alert"
      class="mb-2 flex items-center justify-between gap-2 border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-ui text-destructive"
    >
      <span class="flex items-center gap-2 min-w-0">
        <AlertCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ $t(`timer.errors.${aiErrorCode}`) }}</span>
      </span>
      <button
        type="button"
        :aria-label="$t('timer.cancelEditButton')"
        class="shrink-0 text-destructive/80 hover:text-destructive"
        @click="aiErrorCode = null"
      >
        <X class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>

    <!-- Seamless Fluid Tab Sequence:
         1. Borderless Description Input -> 2. Project/Task Popover -> 3. Tag Icon Popover ->
         4. Billable Icon Toggle -> 5. Start/Stop Icon Button (`⌘I` for silent AI Auto-Fill) -->
    <div class="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
      <!-- 1. Description Input + Top-10 Recall Dropdown -->
      <div class="relative flex-1 min-w-0">
        <input
          ref="descriptionInputRef"
          v-model="timerStore.description"
          type="text"
          data-tour="timer-description"
          :placeholder="$t('timer.descriptionPlaceholder')"
          class="h-10 w-full border-0 border-b border-transparent bg-transparent px-2 text-sm sm:text-base font-medium text-text-primary placeholder:text-text-faint focus:border-signal/60 focus:outline-none transition-colors"
          @focus="showRecallDropdown = topMatches.length > 0"
          @input="showRecallDropdown = topMatches.length > 0"
          @keydown="handleDescriptionKeydown"
        />

        <!-- Floating Top-10 Recall Dropdown -->
        <Transition name="orbital-dropdown">
          <div
            v-if="showRecallDropdown && topMatches.length > 0"
            class="absolute left-0 right-0 top-11 z-40 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl max-md:bottom-12 max-md:top-auto"
          >
            <div class="signal-line" aria-hidden="true" />
            <div class="flex items-center justify-between border-b border-border-hairline px-3.5 py-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              <span>{{ $t('timer.recallHeader') }}</span>
              <button
                type="button"
                class="inline-flex items-center hover:text-text-primary"
                @click="showRecallDropdown = false"
              >
                <BrandKeycapBadge keys="Esc" size="sm" />
              </button>
            </div>
            <ul class="max-h-60 overflow-y-auto divide-y divide-border-hairline">
              <li
                v-for="(tpl, idx) in topMatches"
                :key="tpl.key"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors"
                  :class="
                    idx === highlightedRecallIdx
                      ? 'bg-signal-soft text-text-primary'
                      : 'hover:bg-bg-hover text-text-primary'
                  "
                  @mousedown.prevent="selectRecallTemplate(tpl)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="h-2.5 w-2.5 shrink-0"
                      :style="{ backgroundColor: tpl.projectColorSnapshot }"
                      aria-hidden="true"
                    />
                    <span class="truncate font-medium">{{ tpl.description }}</span>
                    <span class="truncate text-xs text-text-muted">
                      · {{ tpl.projectNameSnapshot }}
                    </span>
                  </div>
                  <span class="tabular-telemetry shrink-0 text-xs text-text-muted">
                    {{ tpl.frequency }}× {{ $t('timer.recallUses') }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </Transition>
      </div>

      <!-- Inline Toolbar: Borderless Project/Task, Icon Tags, Icon Billable, Digits & Action -->
      <div class="relative flex items-center justify-between md:justify-end gap-1.5 md:gap-2 shrink-0">
        <div class="flex items-center gap-0.5 sm:gap-1 min-w-0">
          <!-- 2. Borderless Project & Task Selector -->
          <TimerProjectTaskPopover
            :project-id="timerStore.projectId"
            :task-id="timerStore.taskId"
            variant="command"
            data-tour="timer-project"
            test-id="command-project-trigger"
            @select="handleProjectTaskSelect"
          />

          <!-- 3. Borderless Toggl-Style Tag Icon Popover -->
          <UiTagMultiSelect
            v-model="timerStore.tagIds"
            :tags="scopedTags"
            variant="command-icon"
            data-tour="timer-tags"
            test-id="command-timer-tags-trigger"
          />

          <!-- 4. Borderless Icon-Only Billable Toggle -->
          <UiBillableToggle
            v-model="timerStore.isBillable"
            variant="command"
            data-tour="timer-billable"
            test-id="command-timer-billable-toggle"
          />
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <span class="hidden md:block h-5 w-px bg-border-hairline" aria-hidden="true" />

          <!-- Clickable Elapsed Clock when ActiveTimer is running (FR-5.2) -->
          <button
            v-if="timerStore.isRunning"
            type="button"
            data-testid="active-timer-clock-trigger"
            :aria-expanded="showStartAdjustPopover"
            :aria-label="activeClockTitle"
            :title="activeClockTitle"
            class="btn-press inline-flex h-9 max-md:min-h-[40px] items-center px-2 border border-transparent hover:bg-bg-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal cursor-pointer"
            @click="toggleStartAdjustPopover"
          >
            <BrandTimerDigits
              :seconds="timerStore.currentElapsedSeconds"
              running
              size="md"
            />
          </button>
          <BrandTimerDigits
            v-else
            :seconds="timerStore.currentElapsedSeconds"
            :running="false"
            size="md"
          />

          <!-- 5. Icon-Only Start / Stop Trigger -->
          <button
            type="button"
            data-tour="timer-submit"
            :aria-label="timerStore.isRunning ? $t('timer.stopButton') : $t('timer.startButton')"
            :title="
              timerStore.isRunning
                ? `${$t('timer.stopButton')} [S]`
                : `${$t('timer.startButton')} [Enter]`
            "
            class="btn-press inline-flex h-9 w-9 max-md:h-10 max-md:w-10 shrink-0 items-center justify-center text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :class="
              timerStore.isRunning
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-accent hover:bg-accent-hover'
            "
            @click="handlePrimaryAction"
          >
            <Square v-if="timerStore.isRunning" class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <Play v-else class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        </div>

        <!-- Live Start Time Adjustment Popover (FR-5.2) -->
        <Transition name="orbital-dropdown">
          <form
            v-if="showStartAdjustPopover && timerStore.isRunning"
            data-testid="active-timer-adjust-popover"
            class="absolute right-0 max-md:bottom-12 md:top-11 z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden border border-border-hairline bg-bg-elevated p-3.5 shadow-2xl space-y-3"
            @submit.prevent="handleApplyAdjustedStart"
            @keydown.esc.stop="showStartAdjustPopover = false"
          >
            <div class="signal-line -mx-3.5 -mt-3.5 mb-2.5" aria-hidden="true" />
            <div class="flex items-center justify-between border-b border-border-hairline pb-2 text-xs font-semibold uppercase tracking-wider text-signal">
              <span>{{ $t('timer.liveStart.popoverTitle') }}</span>
              <button
                type="button"
                :aria-label="$t('timer.cancelEditButton')"
                class="text-text-muted hover:text-text-primary"
                @click="showStartAdjustPopover = false"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <!-- Quick Backdate Pills (e.g. "started 15 minutes ago") -->
            <div class="grid grid-cols-4 gap-1.5">
              <button
                v-for="mins in [-5, -15, -30, -60]"
                :key="mins"
                type="button"
                :data-testid="`active-timer-shift-${Math.abs(mins)}m`"
                class="tabular-telemetry btn-press h-8 border border-border-hairline bg-bg-primary text-xs font-medium text-text-primary hover:border-signal hover:text-signal transition-colors"
                @click="handleQuickShiftMinutes(mins)"
              >
                {{ mins === -60 ? '-1h' : `${mins}m` }}
              </button>
            </div>

            <div class="space-y-2">
              <UiDateInput
                v-model="draftStartDateKey"
                v-model:valid="isDraftStartDateValid"
                calendar-placement="inline"
                size="sm"
                :aria-label="$t('timer.liveStart.dateLabel')"
                test-id="active-timer-start-date"
              />
              <input
                ref="liveStartTimeInputRef"
                v-model="draftStartTimeHMS"
                type="time"
                step="1"
                required
                data-testid="active-timer-start-time"
                :aria-label="$t('timer.liveStart.timeLabel')"
                class="tabular-telemetry h-9 w-full border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
              />
            </div>

            <div class="flex items-center justify-between gap-2 pt-0.5">
              <span class="tabular-telemetry text-xs text-text-muted">
                {{
                  $t('timer.liveStart.previewElapsed', {
                    duration: formatHMS(
                      draftAdjustedPreview?.elapsedSeconds ?? timerStore.currentElapsedSeconds
                    ),
                  })
                }}
              </span>

              <button
                type="submit"
                data-testid="active-timer-apply-start"
                :disabled="!draftAdjustedPreview"
                class="btn-press inline-flex h-8 items-center gap-1.5 bg-accent px-3 text-xs font-semibold uppercase text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
              >
                <Check class="h-3.5 w-3.5" aria-hidden="true" />
                <span>{{ $t('timer.liveStart.applyButton') }}</span>
              </button>
            </div>
          </form>
        </Transition>
      </div>
    </div>
  </div>
</template>
