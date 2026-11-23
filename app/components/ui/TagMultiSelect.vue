<script setup lang="ts">
import { Check, ChevronDown, Search, Tag, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import type { EntityId, ProjectTag } from '~/domain/types';

const props = withDefaults(
  defineProps<{
    modelValue: readonly EntityId[];
    tags: readonly ProjectTag[];
    variant?: 'field' | 'row';
    size?: 'sm' | 'md';
    stopPropagation?: boolean;
    dataTour?: string;
    testId?: string;
  }>(),
  {
    variant: 'field',
    size: 'md',
    stopPropagation: false,
    dataTour: undefined,
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [tagIds: EntityId[]];
}>();

const open = ref(false);
const searchQuery = ref('');
const highlightedIdx = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedSet = computed(() => new Set(props.modelValue));

const filteredTags = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.tags;
  return props.tags.filter((tag) => tag.name.toLowerCase().includes(q));
});

const allFilteredSelected = computed(() => {
  if (filteredTags.value.length === 0) return false;
  return filteredTags.value.every((tag) => selectedSet.value.has(tag.id));
});

const selectedTagNames = computed(() => {
  const byId = new Map(props.tags.map((tag) => [tag.id, tag.name]));
  return props.modelValue
    .map((id) => byId.get(id))
    .filter((name): name is string => Boolean(name));
});

const fieldSummaryLabel = computed(() => {
  const names = selectedTagNames.value;
  if (names.length === 0) return null;
  if (names.length <= 2) return names.map((n) => `#${n}`).join(', ');
  return `#${names[0]} +${names.length - 1}`;
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

watch(filteredTags, (next) => {
  if (highlightedIdx.value >= next.length) {
    highlightedIdx.value = Math.max(0, next.length - 1);
  }
});

function toggleTag(tagId: EntityId) {
  if (selectedSet.value.has(tagId)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((id) => id !== tagId)
    );
  } else {
    emit('update:modelValue', [...props.modelValue, tagId]);
  }
}

function toggleSelectAllFiltered() {
  const matchingIds = filteredTags.value.map((t) => t.id);
  if (matchingIds.length === 0) return;

  if (allFilteredSelected.value) {
    const removeSet = new Set(matchingIds);
    emit(
      'update:modelValue',
      props.modelValue.filter((id) => !removeSet.has(id))
    );
  } else {
    const merged = new Set([...props.modelValue, ...matchingIds]);
    emit('update:modelValue', Array.from(merged));
  }
}

function clearAll() {
  if (props.modelValue.length > 0) {
    emit('update:modelValue', []);
  }
}

function handleKeydown(event: KeyboardEvent) {
  const list = filteredTags.value;
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
    if (target) toggleTag(target.id);
  }
}

function handleTriggerClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <!-- Field Trigger (CommandTimerBar & Manual Time Log Form) -->
      <button
        v-if="variant === 'field'"
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'tag-multiselect-trigger'"
        class="inline-flex w-full items-center justify-between gap-2 border bg-bg-primary px-3 text-ui font-mono text-text-primary transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
        :class="[
          size === 'md' ? 'h-10 max-md:min-h-[44px]' : 'h-9',
          modelValue.length > 0 ? 'border-signal/45' : 'border-border-input',
        ]"
        @click="handleTriggerClick"
      >
        <span class="inline-flex items-center gap-1.5 min-w-0 truncate">
          <Tag class="h-4 w-4 shrink-0 text-signal" />
          <span
            class="truncate"
            :class="fieldSummaryLabel ? 'text-signal font-medium' : 'text-text-primary'"
          >
            {{ fieldSummaryLabel || $t('timer.scopedTagsButton') }}
          </span>
        </span>
        <span class="inline-flex items-center gap-1.5 shrink-0">
          <span class="tabular-telemetry border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted">
            {{ modelValue.length }}/{{ tags.length }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 text-text-muted" />
        </span>
      </button>

      <!-- Row Trigger: Clickable #tag Pills when tagged, or Toggl-style Hover-Reveal Tag Icon when untagged -->
      <button
        v-else-if="selectedTagNames.length > 0"
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'tracker-row-tags-trigger'"
        :title="$t('timer.tagSelect.addTagsTooltip')"
        class="inline-flex flex-wrap items-center gap-1.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
        @click="handleTriggerClick"
      >
        <span
          v-for="(tagName, idx) in selectedTagNames"
          :key="idx"
          class="border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs font-mono text-text-muted hover:border-signal/60 hover:text-signal transition-colors"
        >
          #{{ tagName }}
        </span>
      </button>

      <button
        v-else
        type="button"
        :data-tour="dataTour"
        :data-testid="testId ?? 'tracker-row-tags-empty-trigger'"
        :aria-label="$t('timer.tagSelect.addTagsTooltip')"
        :title="$t('timer.tagSelect.addTagsTooltip')"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-transparent bg-transparent text-text-muted transition-all hover:border-border-hairline hover:bg-bg-primary hover:text-signal focus:outline-none focus-visible:border-signal focus-visible:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 data-[state=open]:opacity-100 data-[state=open]:border-signal/50 data-[state=open]:bg-signal-soft data-[state=open]:text-signal max-md:opacity-60"
        @click="handleTriggerClick"
      >
        <Tag class="h-4 w-4" />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tag-multiselect-popover"
        class="relative z-50 w-72 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @keydown="handleKeydown"
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />
        <!-- Search Input Header -->
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-testid="tag-multiselect-search"
            :placeholder="$t('timer.tagSelect.searchPlaceholder')"
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
          v-if="tags.length > 0"
          class="flex items-center justify-between border-b border-border-hairline px-3 py-2 text-xs font-mono"
        >
          <button
            type="button"
            data-testid="tag-multiselect-select-all"
            :disabled="filteredTags.length === 0"
            class="text-signal hover:underline disabled:opacity-40 disabled:no-underline"
            @click="toggleSelectAllFiltered"
          >
            {{
              allFilteredSelected
                ? $t('timer.tagSelect.deselectAll')
                : $t('timer.tagSelect.selectAll')
            }}
          </button>

          <div class="flex items-center gap-2">
            <span class="tabular-telemetry text-text-muted">
              {{ $t('timer.tagSelect.selectedCount', { count: modelValue.length }) }}
            </span>
            <button
              v-if="modelValue.length > 0"
              type="button"
              data-testid="tag-multiselect-clear"
              class="text-text-muted hover:text-text-primary hover:underline"
              @click="clearAll"
            >
              {{ $t('timer.tagSelect.clear') }}
            </button>
          </div>
        </div>

        <!-- Scoped Tag Option List -->
        <div v-if="tags.length === 0" class="px-3 py-4 text-center text-ui font-mono text-text-muted">
          {{ $t('timer.noScopedTags') }}
        </div>
        <div
          v-else-if="filteredTags.length === 0"
          class="px-3 py-4 text-center text-ui font-mono text-text-muted"
        >
          {{ $t('timer.tagSelect.noMatches', { query: searchQuery }) }}
        </div>
        <ul
          v-else
          role="listbox"
          aria-multiselectable="true"
          class="max-h-56 overflow-y-auto divide-y divide-border-subtle py-0.5"
        >
          <li
            v-for="(tag, idx) in filteredTags"
            :key="tag.id"
            role="option"
            :aria-selected="selectedSet.has(tag.id)"
          >
            <button
              type="button"
              :data-testid="`tag-multiselect-option-${tag.id}`"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui font-mono transition-colors"
              :class="[
                idx === highlightedIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/70',
                selectedSet.has(tag.id) ? 'text-signal font-medium' : 'text-text-primary',
              ]"
              @mouseenter="highlightedIdx = idx"
              @click="toggleTag(tag.id)"
            >
              <span class="inline-flex items-center gap-2 min-w-0 truncate">
                <span
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors"
                  :class="
                    selectedSet.has(tag.id)
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-input bg-bg-primary'
                  "
                >
                  <Check v-if="selectedSet.has(tag.id)" class="h-3 w-3" />
                </span>
                <span class="truncate">#{{ tag.name }}</span>
              </span>
            </button>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
