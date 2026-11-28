<script setup lang="ts">
import { CalendarRange, Check, ChevronDown, Loader2, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import type { AdoIterationInfo } from '~/domain/ado';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    iterations: readonly AdoIterationInfo[];
    loading?: boolean;
    disabled?: boolean;
    testId?: string;
  }>(),
  {
    loading: false,
    disabled: false,
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [iterationPath: string];
}>();

const { t } = useI18n();
const prefsStore = usePreferencesStore();
const { formatDateKey } = useFormat(() => prefsStore.preferences);

const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedIteration = computed(() =>
  props.iterations.find((i) => i.iterationPath === props.modelValue)
);

function formatDateRange(iter: AdoIterationInfo): string {
  const start = iter.startDate?.slice(0, 10);
  const finish = iter.finishDate?.slice(0, 10);
  if (start && finish) {
    return `${formatDateKey(start)} – ${formatDateKey(finish)}`;
  }
  if (start) return formatDateKey(start);
  if (finish) return formatDateKey(finish);
  return '';
}

function timeFrameLabel(timeFrame: AdoIterationInfo['timeFrame']): string {
  if (timeFrame === 'current') return t('tasks.currentSprintTag');
  if (timeFrame === 'future') return t('ado.sprintPicker.futureTag');
  return t('ado.sprintPicker.pastTag');
}

const filteredIterations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.iterations;
  return props.iterations.filter((iter) => {
    const tf = timeFrameLabel(iter.timeFrame).toLowerCase();
    return (
      iter.displayPath.toLowerCase().includes(q) ||
      iter.name.toLowerCase().includes(q) ||
      iter.iterationPath.toLowerCase().includes(q) ||
      tf.includes(q)
    );
  });
});

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    const activeIdx = props.iterations.findIndex((i) => i.iterationPath === props.modelValue);
    highlightedIdx.value = activeIdx >= 0 ? activeIdx : 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

watch(filteredIterations, (next) => {
  if (highlightedIdx.value >= next.length) {
    highlightedIdx.value = Math.max(0, next.length - 1);
  }
});

function selectIteration(iterationPath: string) {
  emit('update:modelValue', iterationPath);
  open.value = false;
}

function handleKeydown(event: KeyboardEvent) {
  const list = filteredIterations.value;
  if (list.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIdx.value = (highlightedIdx.value + 1) % list.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIdx.value =
      highlightedIdx.value <= 0 ? list.length - 1 : highlightedIdx.value - 1;
  } else if (event.key === 'Enter') {
    const target = list[highlightedIdx.value];
    if (target) {
      event.preventDefault();
      selectIteration(target.iterationPath);
    }
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :data-testid="testId ?? 'tasks-sprint-select'"
        :disabled="loading || disabled"
        class="btn-press inline-flex h-10 min-w-0 max-w-full items-center justify-between gap-2.5 border border-border-input bg-bg-primary px-3 text-left text-ui transition-colors hover:border-signal/60 hover:bg-bg-hover focus:border-signal focus:outline-none disabled:opacity-55 data-[state=open]:border-signal"
      >
        <span class="flex items-center gap-2 min-w-0">
          <Loader2
            v-if="loading"
            class="h-3.5 w-3.5 shrink-0 animate-spin text-signal"
            aria-hidden="true"
          />
          <CalendarRange v-else class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          <span class="truncate font-medium text-text-primary">
            <template v-if="loading">{{ $t('tasks.loadingSprints') }}</template>
            <template v-else-if="selectedIteration">{{ selectedIteration.displayPath }}</template>
            <template v-else>{{ $t('tasks.sprintSelectorLabel') }}</template>
          </span>
          <span
            v-if="!loading && selectedIteration?.timeFrame === 'current'"
            class="shrink-0 border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-500"
          >
            {{ $t('tasks.currentSprintTag') }}
          </span>
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tasks-sprint-picker-popover"
        class="orbital-popover relative z-50 w-72 sm:w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @keydown="handleKeydown"
      >
        <div class="signal-line" aria-hidden="true" />

        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('ado.sprintPicker.searchPlaceholder')"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            :aria-label="$t('confirm.cancelAction')"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div
          v-if="filteredIterations.length === 0"
          class="px-3 py-4 text-center text-ui text-text-muted"
        >
          {{ iterations.length === 0 ? $t('ado.sprintPicker.empty') : $t('ado.sprintPicker.noMatches') }}
        </div>

        <ul
          v-else
          role="listbox"
          class="max-h-72 overflow-y-auto divide-y divide-border-subtle py-0.5"
        >
          <li
            v-for="(iter, idx) in filteredIterations"
            :key="iter.id"
            role="option"
            :aria-selected="iter.iterationPath === modelValue"
          >
            <button
              type="button"
              class="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                iter.iterationPath === modelValue ? 'text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
              @click="selectIteration(iter.iterationPath)"
            >
              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="truncate">{{ iter.displayPath }}</span>
                  <span
                    v-if="iter.timeFrame === 'current'"
                    class="shrink-0 border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-500"
                  >
                    {{ $t('tasks.currentSprintTag') }}
                  </span>
                  <span
                    v-else-if="iter.timeFrame === 'future'"
                    class="shrink-0 border border-signal/35 bg-signal-soft px-1.5 py-0.5 text-xs font-medium text-signal"
                  >
                    {{ $t('ado.sprintPicker.futureTag') }}
                  </span>
                  <span
                    v-else
                    class="shrink-0 border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs text-text-faint"
                  >
                    {{ $t('ado.sprintPicker.pastTag') }}
                  </span>
                </div>
                <div
                  v-if="formatDateRange(iter)"
                  class="tabular-telemetry text-xs text-text-muted"
                >
                  {{ formatDateRange(iter) }}
                </div>
              </div>

              <Check
                v-if="iter.iterationPath === modelValue"
                class="mt-1 h-3.5 w-3.5 shrink-0 text-signal"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
