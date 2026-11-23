<script setup lang="ts">
import { Check, ChevronDown, Search, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';

export interface FilterMultiSelectOption {
  value: string;
  label: string;
  secondaryLabel?: string;
  color?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    options: readonly FilterMultiSelectOption[];
    label: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    testId?: string;
  }>(),
  {
    placeholder: undefined,
    searchPlaceholder: undefined,
    emptyText: undefined,
    testId: 'filter-multiselect',
  }
);

const emit = defineEmits<{
  'update:modelValue': [values: string[]];
}>();

const { t } = useI18n();
const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedSet = computed(() => new Set(props.modelValue));

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      (opt.secondaryLabel && opt.secondaryLabel.toLowerCase().includes(q))
  );
});

const allFilteredSelected = computed(() => {
  if (filteredOptions.value.length === 0) return false;
  return filteredOptions.value.every((opt) => selectedSet.value.has(opt.value));
});

const summaryLabel = computed(() => {
  if (props.modelValue.length === 0) {
    return props.placeholder ?? t('dashboard.filters.all');
  }
  const byVal = new Map(props.options.map((o) => [o.value, o.label]));
  const selectedLabels = props.modelValue
    .map((v) => byVal.get(v) ?? v)
    .filter(Boolean);
  if (selectedLabels.length === 0) {
    return props.placeholder ?? t('dashboard.filters.all');
  }
  if (selectedLabels.length === 1) return selectedLabels[0];
  return `${selectedLabels[0]} +${selectedLabels.length - 1}`;
});

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    highlightedIdx.value = 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

watch(filteredOptions, (next) => {
  if (highlightedIdx.value >= next.length) {
    highlightedIdx.value = Math.max(0, next.length - 1);
  }
});

function toggleOption(value: string) {
  if (selectedSet.value.has(value)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((v) => v !== value)
    );
  } else {
    emit('update:modelValue', [...props.modelValue, value]);
  }
}

function toggleSelectAllFiltered() {
  const matching = filteredOptions.value.map((o) => o.value);
  if (matching.length === 0) return;

  if (allFilteredSelected.value) {
    const removeSet = new Set(matching);
    emit(
      'update:modelValue',
      props.modelValue.filter((v) => !removeSet.has(v))
    );
  } else {
    const merged = new Set([...props.modelValue, ...matching]);
    emit('update:modelValue', Array.from(merged));
  }
}

function clearAll() {
  if (props.modelValue.length > 0) {
    emit('update:modelValue', []);
  }
}

function handleKeydown(event: KeyboardEvent) {
  const list = filteredOptions.value;
  if (list.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIdx.value = (highlightedIdx.value + 1) % list.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIdx.value =
      highlightedIdx.value <= 0 ? list.length - 1 : highlightedIdx.value - 1;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const target = list[highlightedIdx.value];
    if (target) toggleOption(target.value);
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :data-testid="`${testId}-trigger`"
        class="flex h-10 w-full items-center justify-between gap-2 border bg-bg-primary px-3 text-left text-ui font-mono transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
        :class="modelValue.length > 0 ? 'border-signal/55' : 'border-border-input'"
      >
        <span class="flex items-center gap-1.5 min-w-0 truncate">
          <span class="shrink-0 text-xs uppercase tracking-wider text-text-muted">
            {{ label }}:
          </span>
          <span
            class="truncate"
            :class="modelValue.length > 0 ? 'text-signal font-medium' : 'text-text-primary'"
          >
            {{ summaryLabel }}
          </span>
        </span>

        <span class="inline-flex items-center gap-1.5 shrink-0">
          <span
            class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs"
            :class="modelValue.length > 0 ? 'border-signal/40 text-signal' : 'text-text-muted'"
          >
            {{ modelValue.length }}/{{ options.length }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 text-text-muted" />
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        :data-testid="`${testId}-popover`"
        class="relative z-50 w-80 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @keydown="handleKeydown"
      >
        <div class="signal-line" aria-hidden="true" />
        <!-- Search Input Header -->
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :data-testid="`${testId}-search`"
            :placeholder="searchPlaceholder || $t('dashboard.filters.searchFallback')"
            class="w-full bg-transparent text-ui font-mono text-text-primary placeholder:text-text-faint focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Select All / Clear Action Bar -->
        <div
          v-if="options.length > 0"
          class="flex items-center justify-between border-b border-border-hairline px-3 py-2 text-xs font-mono"
        >
          <button
            type="button"
            :data-testid="`${testId}-select-all`"
            :disabled="filteredOptions.length === 0"
            class="text-signal hover:underline disabled:opacity-40 disabled:no-underline"
            @click="toggleSelectAllFiltered"
          >
            {{
              allFilteredSelected
                ? $t('dashboard.filters.deselectAll')
                : $t('dashboard.filters.selectAll')
            }}
          </button>

          <div class="flex items-center gap-2">
            <span class="tabular-telemetry text-text-muted">
              {{ $t('dashboard.filters.selectedCount', { count: modelValue.length }) }}
            </span>
            <button
              v-if="modelValue.length > 0"
              type="button"
              :data-testid="`${testId}-clear`"
              class="text-text-muted hover:text-text-primary hover:underline"
              @click="clearAll"
            >
              {{ $t('dashboard.filters.clear') }}
            </button>
          </div>
        </div>

        <!-- Option List -->
        <div v-if="options.length === 0" class="px-3 py-4 text-center text-ui font-mono text-text-muted">
          {{ emptyText || $t('dashboard.filters.noMatches', { query: '' }) }}
        </div>
        <div
          v-else-if="filteredOptions.length === 0"
          class="px-3 py-4 text-center text-ui font-mono text-text-muted"
        >
          {{ $t('dashboard.filters.noMatches', { query: searchQuery }) }}
        </div>
        <ul
          v-else
          role="listbox"
          aria-multiselectable="true"
          class="max-h-60 overflow-y-auto divide-y divide-border-subtle py-0.5"
        >
          <li
            v-for="(opt, idx) in filteredOptions"
            :key="opt.value"
            role="option"
            :aria-selected="selectedSet.has(opt.value)"
          >
            <button
              type="button"
              :data-testid="`${testId}-option-${opt.value}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui font-mono transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                selectedSet.has(opt.value) ? 'text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
              @click="toggleOption(opt.value)"
            >
              <span class="inline-flex items-center gap-2 min-w-0 flex-1">
                <span
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors"
                  :class="
                    selectedSet.has(opt.value)
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-input bg-bg-primary'
                  "
                >
                  <Check v-if="selectedSet.has(opt.value)" class="h-3 w-3" />
                </span>
                <span
                  v-if="opt.color"
                  class="h-2.5 w-2.5 shrink-0"
                  :style="{ backgroundColor: opt.color }"
                />
                <span class="truncate">{{ opt.label }}</span>
              </span>
              <span
                v-if="opt.secondaryLabel"
                class="shrink-0 truncate max-w-[110px] text-xs text-text-muted"
              >
                {{ opt.secondaryLabel }}
              </span>
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
