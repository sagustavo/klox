<script setup lang="ts">
import { Plus, Trash2, Edit3, Check, X } from 'lucide-vue-next';
import { formatHMS, parseHMS, toDateKey } from '~/domain/duration';
import { UNASSIGNED_PROJECT_ID, applyProjectSwitch } from '~/domain/invariants';
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

// Manual Time Log form state
const showManualForm = ref(false);
const manualDescription = ref('');
const manualProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);
const manualTagIds = ref<EntityId[]>([]);
const manualBillable = ref(false);
const manualDate = ref(toDateKey(new Date(), 'UTC'));
const manualStartHM = ref('09:00');
const manualDurationHMS = ref('01:00:00');

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

  await timeLogsStore.createTimeLog({
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
  await timeLogsStore.deleteTimeLog({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    logId,
  });
}

// Group historical logs by dateKey descending
const groupedByDay = computed(() => {
  const groups = new Map<string, { dateKey: string; totalSeconds: number; items: TimeLog[] }>();
  for (const log of timeLogsStore.sortedLogs) {
    const existing = groups.get(log.dateKey);
    if (!existing) {
      groups.set(log.dateKey, {
        dateKey: log.dateKey,
        totalSeconds: log.durationSeconds,
        items: [log],
      });
    } else {
      existing.totalSeconds += log.durationSeconds;
      existing.items.push(log);
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
});
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
    <div class="flex items-center justify-between">
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

    <!-- Historical TimeLogs Grouped by Day -->
    <div
      v-if="groupedByDay.length === 0"
      class="border border-border-hairline bg-bg-elevated p-8 text-center text-xs font-mono text-text-muted"
    >
      {{ $t('timer.emptyLogs') }}
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="group in groupedByDay"
        :key="group.dateKey"
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
          <li
            v-for="log in group.items"
            :key="log.id"
            class="px-4 py-3 hover:bg-bg-hover/50 transition-colors"
          >
            <!-- Inline Edit Mode -->
            <div v-if="editingLogId === log.id" class="space-y-2.5">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input
                  v-model="editDescription"
                  type="text"
                  class="sm:col-span-5 h-8 border border-border-hairline bg-bg-primary px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
                <select
                  :value="editProjectId"
                  class="sm:col-span-3 h-8 border border-border-hairline bg-bg-primary px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                  @change="handleEditProjectChange(($event.target as HTMLSelectElement).value)"
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
                  v-model="editDurationHMS"
                  type="text"
                  class="tabular-telemetry sm:col-span-2 h-8 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
                />
                <div class="sm:col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 bg-accent px-2.5 text-xs font-mono text-white"
                    @click="saveInlineEdit(log)"
                  >
                    <Check class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center border border-border-hairline bg-bg-primary px-2 text-xs text-text-muted"
                    @click="editingLogId = null"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  v-for="tag in editScopedTags"
                  :key="tag.id"
                  type="button"
                  class="border px-2 py-0.5 text-[11px] font-mono"
                  :class="
                    editTagIds.includes(tag.id)
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border-hairline bg-bg-primary text-text-muted'
                  "
                  @click="toggleEditTag(tag.id)"
                >
                  #{{ tag.name }}
                </button>
                <label class="ml-2 inline-flex items-center gap-1 text-xs font-mono text-text-muted cursor-pointer">
                  <input v-model="editBillable" type="checkbox" class="accent-accent" />
                  <span>$</span>
                </label>
              </div>
            </div>

            <!-- Standard Display Row -->
            <div v-else class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-2.5 min-w-0">
                <span class="text-sm font-medium text-text-primary">
                  {{ log.description }}
                </span>

                <span class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs">
                  <span
                    class="h-2 w-2"
                    :style="{ backgroundColor: log.projectColorSnapshot }"
                  />
                  <span>
                    {{
                      displayProjectName(
                        catalogStore.getProjectById(log.projectId),
                        log.projectNameSnapshot
                      )
                    }}
                  </span>
                </span>

                <span
                  v-for="(tagName, idx) in log.tagNamesSnapshot"
                  :key="idx"
                  class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-[11px] font-mono text-text-muted"
                >
                  #{{ tagName }}
                </span>

                <span
                  v-if="log.isBillable"
                  class="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                >
                  $
                </span>
              </div>

              <div class="flex items-center gap-3 shrink-0">
                <span class="tabular-telemetry hidden sm:inline text-xs font-mono text-text-muted">
                  {{ formatTime(log.startTime) }} – {{ formatTime(log.endTime) }}
                </span>
                <span class="tabular-telemetry font-mono text-sm font-semibold text-text-primary">
                  {{ formatDuration(log.durationSeconds) }}
                </span>

                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
                    :aria-label="$t('timer.editButton')"
                    @click="startInlineEdit(log)"
                  >
                    <Edit3 class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-red-400"
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
      </div>
    </div>
  </div>
</template>
