<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { Check, Filter, Search, X } from 'lucide-vue-next';
import type { TogglPreviewFilterOption } from '~/domain/toggl';

const MAX_RENDERED_OPTIONS = 150;

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    options: readonly TogglPreviewFilterOption[];
    label: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyText?: string;
    align?: 'left' | 'right';
    testId?: string;
  }>(),
  {
    searchable: true,
    searchPlaceholder: '',
    emptyText: '',
    align: 'left',
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [values: string[]];
}>();

const open = ref(false);
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

watch(open, async (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    if (props.searchable) {
      await nextTick();
      searchInputRef.value?.focus();
    }
  }
});

const selectedSet = computed(() => new Set(props.modelValue));
const selectedCount = computed(() => props.modelValue.length);

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((opt) => opt.label.toLowerCase().includes(q));
});

const displayedOptions = computed(() =>
  filteredOptions.value.slice(0, MAX_RENDERED_OPTIONS)
);

const isTruncated = computed(
  () => filteredOptions.value.length > MAX_RENDERED_OPTIONS
);

const allMatchingSelected = computed(() => {
  if (filteredOptions.value.length === 0) return false;
  return filteredOptions.value.every((opt) => selectedSet.value.has(opt.value));
});

function toggleValue(value: string) {
  const next = new Set(props.modelValue);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  emit('update:modelValue', Array.from(next));
}

function toggleAllMatching() {
  const next = new Set(props.modelValue);
  if (allMatchingSelected.value) {
    for (const opt of filteredOptions.value) {
      next.delete(opt.value);
    }
  } else {
    for (const opt of filteredOptions.value) {
      next.add(opt.value);
    }
  }
  emit('update:modelValue', Array.from(next));
}

function clearSelection() {
  emit('update:modelValue', []);
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :data-testid="testId ? `${testId}-trigger` : undefined"
        :aria-label="$t('csv.table.filterColumnAria', { column: label })"
        :aria-expanded="open"
        aria-haspopup="dialog"
        class="group inline-flex max-w-full items-center gap-1.5 rounded-sm py-0.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
        :class="[
          align === 'right' ? 'ml-auto flex-row-reverse' : '',
          selectedCount > 0
            ? 'text-signal'
            : open
              ? 'text-text-primary'
              : 'text-text-muted hover:text-text-primary',
        ]"
      >
        <span class="truncate">{{ label }}</span>

        <span
          class="inline-flex shrink-0 items-center gap-1 transition-opacity"
          :class="
            selectedCount > 0 || open
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-80 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-60'
          "
        >
          <Filter
            class="h-3 w-3 shrink-0"
            :class="selectedCount > 0 ? 'fill-signal/20 text-signal' : ''"
            aria-hidden="true"
          />
          <span
            v-if="selectedCount > 0"
            class="tabular-telemetry border border-signal/35 bg-signal-soft px-1 text-xs font-medium leading-tight text-signal"
          >
            {{ selectedCount }}
          </span>
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :align="align === 'right' ? 'end' : 'start'"
        :side-offset="6"
        :collision-padding="12"
        :data-testid="testId ? `${testId}-popover` : undefined"
        class="orbital-popover relative z-50 w-72 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @open-auto-focus="
          (event) => {
            if (searchable) {
              event.preventDefault();
            }
          }
        "
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />

        <!-- Search Box -->
        <div
          v-if="searchable"
          class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2"
        >
          <Search class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :data-testid="testId ? `${testId}-search` : undefined"
            :placeholder="searchPlaceholder"
            :aria-label="searchPlaceholder || label"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="text-text-muted transition-colors hover:text-text-primary"
            :aria-label="$t('csv.table.clearSelection')"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <!-- Bulk Selection Actions -->
        <div
          class="flex items-center justify-between gap-2 border-b border-border-hairline bg-bg-primary/30 px-3 py-1.5 text-xs"
        >
          <button
            type="button"
            :disabled="filteredOptions.length === 0"
            class="font-medium text-text-secondary transition-colors hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
            @click="toggleAllMatching"
          >
            {{
              allMatchingSelected
                ? $t('csv.table.deselectMatching')
                : $t('csv.table.selectAll')
            }}
          </button>

          <button
            v-if="selectedCount > 0"
            type="button"
            class="font-medium text-text-muted transition-colors hover:text-text-primary"
            @click="clearSelection"
          >
            {{ $t('csv.table.clearSelection') }}
          </button>
        </div>

        <!-- Options Listbox -->
        <div
          v-if="filteredOptions.length === 0"
          class="px-3 py-5 text-center text-ui text-text-muted"
        >
          {{ emptyText || $t('csv.table.noOptions') }}
        </div>

        <ul
          v-else
          role="listbox"
          aria-multiselectable="true"
          :aria-label="label"
          class="max-h-60 overflow-y-auto divide-y divide-border-subtle"
        >
          <li v-for="opt in displayedOptions" :key="opt.value">
            <button
              type="button"
              role="option"
              :aria-selected="selectedSet.has(opt.value)"
              class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ui transition-colors hover:bg-bg-hover"
              :class="
                selectedSet.has(opt.value)
                  ? 'bg-signal-soft/70 text-text-primary font-medium'
                  : 'text-text-secondary'
              "
              @click="toggleValue(opt.value)"
            >
              <span class="inline-flex min-w-0 items-center gap-2">
                <span
                  class="flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors"
                  :class="
                    selectedSet.has(opt.value)
                      ? 'border-signal bg-signal text-white'
                      : 'border-border-input bg-bg-primary'
                  "
                  aria-hidden="true"
                >
                  <Check v-if="selectedSet.has(opt.value)" class="h-2.5 w-2.5" />
                </span>
                <span class="truncate" :title="opt.label">{{ opt.label }}</span>
              </span>

              <span class="tabular-telemetry shrink-0 text-xs text-text-muted">
                {{ opt.count }}
              </span>
            </button>
          </li>
        </ul>

        <!-- Truncation Footer -->
        <div
          v-if="isTruncated"
          class="border-t border-border-hairline bg-bg-primary/40 px-3 py-1.5 text-xs text-text-muted"
        >
          {{
            $t('csv.table.optionsTruncated', {
              shown: MAX_RENDERED_OPTIONS,
              total: filteredOptions.length,
            })
          }}
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
