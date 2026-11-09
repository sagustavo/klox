<script setup lang="ts">
import { Sparkles, Play, Square, Tag, DollarSign, AlertCircle } from 'lucide-vue-next';
import { publishDomainEvent } from '~/domain/events';
import type { AiAutofillPrediction, RecallTemplate } from '~/domain/recall';
import type { Project } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timerStore = useTimerStore();
const timeLogsStore = useTimeLogsStore();

const descriptionInputRef = ref<HTMLInputElement | null>(null);
const showRecallDropdown = ref(false);
const highlightedRecallIdx = ref(-1);
const showTagsPopover = ref(false);

const aiLoading = ref(false);
const aiErrorCode = ref<string | null>(null);

const { topMatches } = useTaskRecall(
  () => timeLogsStore.logs,
  toRef(timerStore, 'description')
);

const scopedTags = computed(() =>
  catalogStore.getTagsForProject(timerStore.projectId)
);

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function focusDescription() {
  descriptionInputRef.value?.focus();
  showRecallDropdown.value = topMatches.value.length > 0;
  highlightedRecallIdx.value = -1;
}

function closeMenusAndBlur() {
  showRecallDropdown.value = false;
  showTagsPopover.value = false;
  highlightedRecallIdx.value = -1;
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function selectRecallTemplate(tpl: RecallTemplate) {
  timerStore.description = tpl.description;
  timerStore.selectProject(tpl.projectId);
  // Keep only tags that still exist under that project
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
  showTagsPopover.value = false;

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

/**
 * Global keyboard shortcuts (GEMINI.md §3.2):
 * Guarded so single-key shortcuts (`N`, `S`) do NOT fire while focused inside INPUT, TEXTAREA, or SELECT.
 * `Cmd+I` / `Ctrl+I` and `Esc` work globally.
 */
function handleGlobalKeydown(e: KeyboardEvent) {
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
  <div class="border border-border-hairline bg-bg-elevated p-3 sm:p-5 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-40 max-md:border-x-0 max-md:border-b-0 max-md:border-t-2 max-md:border-accent/60 max-md:shadow-2xl">
    <!-- Top Telemetry Status Bar -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-text-muted">
      <div class="flex items-center gap-2">
        <span
          class="h-2 w-2"
          :class="timerStore.isRunning ? 'bg-accent animate-pulse' : 'bg-border-hairline'"
        />
        <span :class="timerStore.isRunning ? 'text-accent' : 'text-text-muted'">
          {{ timerStore.isRunning ? $t('timer.statusRunning') : $t('timer.statusIdle') }}
        </span>
      </div>

      <div class="hidden md:flex items-center gap-3">
        <span class="inline-flex items-center gap-1">
          <BrandKeycapBadge keys="N" />
          <span>{{ $t('landing.shortcutFocus') }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <BrandKeycapBadge keys="Tab" />
          <span>{{ $t('landing.shortcutCycle') }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <BrandKeycapBadge :keys="['⌘', 'I']" />
          <span>{{ $t('landing.shortcutAi') }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <BrandKeycapBadge keys="S" />
          <span>{{ $t('landing.shortcutStop') }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <BrandKeycapBadge keys="Esc" />
        </span>
      </div>
    </div>

    <div
      v-if="aiErrorCode"
      class="mb-3 flex items-center gap-2 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400"
    >
      <AlertCircle class="h-3.5 w-3.5 shrink-0" />
      <span>{{ $t(`timer.errors.${aiErrorCode}`) }}</span>
    </div>

    <!-- Fluid Tab Sequence:
         1. Description Input -> 2. Project Selector -> 3. Project-Scoped Tag Selector ->
         4. Billable Toggle -> 5. Start/Stop Button ( plus [✨ AI Auto-Fill] button ) -->
    <div class="grid grid-cols-1 gap-2.5 lg:grid-cols-12 lg:items-center">
      <!-- 1. Description Input + Fuse.js Top-10 Recall Dropdown -->
      <div class="relative lg:col-span-4">
        <input
          ref="descriptionInputRef"
          v-model="timerStore.description"
          type="text"
          data-tour="timer-description"
          :placeholder="$t('timer.descriptionPlaceholder')"
          class="h-10 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          @focus="showRecallDropdown = topMatches.length > 0"
          @input="showRecallDropdown = topMatches.length > 0"
          @keydown="handleDescriptionKeydown"
        />

        <!-- Floating Fuse.js Top-10 Recall Dropdown -->
        <div
          v-if="showRecallDropdown && topMatches.length > 0"
          class="absolute left-0 right-0 top-11 z-40 border border-border-hairline bg-bg-elevated shadow-xl"
        >
          <div class="flex items-center justify-between border-b border-border-hairline px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
            <span>{{ $t('timer.recallHeader') }}</span>
            <button
              type="button"
              class="hover:text-text-primary"
              @click="showRecallDropdown = false"
            >
              [ESC]
            </button>
          </div>
          <ul class="max-h-60 overflow-y-auto divide-y divide-border-hairline">
            <li
              v-for="(tpl, idx) in topMatches"
              :key="tpl.key"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors"
                :class="
                  idx === highlightedRecallIdx
                    ? 'bg-accent/15 text-text-primary'
                    : 'hover:bg-bg-hover text-text-primary'
                "
                @mousedown.prevent="selectRecallTemplate(tpl)"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="h-2.5 w-2.5 shrink-0"
                    :style="{ backgroundColor: tpl.projectColorSnapshot }"
                  />
                  <span class="truncate font-medium">{{ tpl.description }}</span>
                  <span class="truncate text-[11px] font-mono text-text-muted">
                    · {{ tpl.projectNameSnapshot }}
                  </span>
                </div>
                <span class="tabular-telemetry shrink-0 text-[10px] font-mono text-text-muted">
                  {{ tpl.frequency }}× {{ $t('timer.recallUses') }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- 2. Project Selector -->
      <div class="lg:col-span-2">
        <select
          :value="timerStore.projectId"
          data-tour="timer-project"
          :aria-label="$t('timer.projectLabel')"
          class="h-10 w-full border border-border-hairline bg-bg-primary px-2.5 text-xs font-medium text-text-primary focus:border-accent focus:outline-none"
          @change="timerStore.selectProject(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="proj in catalogStore.sortedProjects"
            :key="proj.id"
            :value="proj.id"
          >
            {{ displayProjectName(proj) }}
          </option>
        </select>
      </div>

      <!-- 3. Project-Scoped Tag Selector -->
      <div class="relative lg:col-span-2">
        <button
          type="button"
          data-tour="timer-tags"
          class="inline-flex h-10 w-full items-center justify-between gap-1.5 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none hover:bg-bg-hover"
          @click="showTagsPopover = !showTagsPopover"
        >
          <span class="inline-flex items-center gap-1.5 truncate">
            <Tag class="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{{ $t('timer.scopedTagsButton') }}</span>
          </span>
          <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-[10px]">
            {{ timerStore.tagIds.length }}/{{ scopedTags.length }}
          </span>
        </button>

        <!-- Scoped Tags Popover -->
        <div
          v-if="showTagsPopover"
          class="absolute left-0 right-0 top-11 z-40 border border-border-hairline bg-bg-elevated p-3 shadow-xl"
        >
          <div v-if="scopedTags.length === 0" class="text-[11px] font-mono text-text-muted">
            {{ $t('timer.noScopedTags') }}
          </div>
          <div v-else class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in scopedTags"
              :key="tag.id"
              type="button"
              class="inline-flex items-center gap-1 border px-2 py-1 text-xs font-mono transition-colors"
              :class="
                timerStore.tagIds.includes(tag.id)
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
              "
              @click="timerStore.toggleTag(tag.id)"
            >
              <span>#{{ tag.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 4. Billable Toggle -->
      <div class="lg:col-span-1">
        <button
          type="button"
          data-tour="timer-billable"
          :aria-pressed="timerStore.isBillable"
          :title="$t('timer.billableToggle')"
          class="inline-flex h-10 w-full items-center justify-center gap-1 border text-xs font-mono transition-colors focus:border-accent focus:outline-none"
          :class="
            timerStore.isBillable
              ? 'border-accent bg-accent/15 text-accent font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="timerStore.isBillable = !timerStore.isBillable"
        >
          <DollarSign class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- 5. Start/Stop Button + Live Telemetry Digits + [✨ AI Auto-Fill] -->
      <div class="lg:col-span-3 flex items-center justify-between lg:justify-end gap-2">
        <button
          type="button"
          data-tour="timer-ai-autofill"
          :disabled="aiLoading"
          :title="`${$t('timer.aiAutofillButton')} (⌘I / Ctrl+I)`"
          class="inline-flex h-10 items-center gap-1 border border-accent/40 bg-accent/10 px-2.5 text-xs font-mono text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors focus:border-accent focus:outline-none"
          @click="triggerAiAutofill"
        >
          <Sparkles class="h-3.5 w-3.5" />
          <span class="hidden xl:inline">
            {{ aiLoading ? $t('timer.aiLoading') : '✨' }}
          </span>
        </button>

        <BrandTimerDigits
          :seconds="timerStore.currentElapsedSeconds"
          :running="timerStore.isRunning"
          size="md"
        />

        <button
          type="button"
          data-tour="timer-submit"
          class="inline-flex h-10 items-center gap-1.5 px-3.5 text-xs font-mono uppercase tracking-wider text-white transition-colors focus:outline-none"
          :class="
            timerStore.isRunning
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-accent hover:bg-accent-hover'
          "
          @click="handlePrimaryAction"
        >
          <Square v-if="timerStore.isRunning" class="h-3 w-3 fill-current" />
          <Play v-else class="h-3 w-3 fill-current" />
          <span>{{ timerStore.isRunning ? $t('timer.stopButton') : $t('timer.startButton') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
