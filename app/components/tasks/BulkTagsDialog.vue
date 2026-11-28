<script setup lang="ts">
import { Check, Loader2, Plus, Search, Tag, X } from 'lucide-vue-next';
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
  MAX_TAG_NAME_LENGTH,
  summarizeSelectedTaskTags,
  type BulkTagUpdateMode,
} from '~/domain/invariants';
import type { EntityId, ProjectTag, Task } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

const props = withDefaults(
  defineProps<{
    open: boolean;
    selectedTasks: readonly Task[];
    projectId: EntityId;
    projectTags: readonly ProjectTag[];
    saving?: boolean;
  }>(),
  {
    saving: false,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  apply: [payload: { mode: BulkTagUpdateMode; tagIds: EntityId[] }];
}>();

const authStore = useAuthStore();
const catalogStore = useCatalogStore();

const mode = ref<BulkTagUpdateMode>('add');
const draftTagIds = ref<EntityId[]>([]);
const searchQuery = ref('');
const creatingTag = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedTagSet = computed(() => new Set(draftTagIds.value));

const tagCoverage = computed(() => {
  const { commonTagIds, partialTagIds } = summarizeSelectedTaskTags(props.selectedTasks);
  return {
    commonTagIds,
    partialTagIds,
    commonSet: new Set(commonTagIds),
    partialSet: new Set(partialTagIds),
  };
});

const filteredTags = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.projectTags;
  return props.projectTags.filter((tag) => tag.name.toLowerCase().includes(q));
});

const creatableTagName = computed(() => {
  if (mode.value === 'remove' || !authStore.user || !props.projectId) return '';
  const trimmed = searchQuery.value.trim();
  if (!trimmed || trimmed.length > MAX_TAG_NAME_LENGTH) return '';
  const lower = trimmed.toLowerCase();
  if (props.projectTags.some((t) => t.name.trim().toLowerCase() === lower)) return '';
  return trimmed;
});

const canApply = computed(() => {
  if (props.saving || props.selectedTasks.length === 0) return false;
  if (mode.value === 'replace') return true;
  return draftTagIds.value.length > 0;
});

const applyButtonLabelKey = computed(() => {
  if (props.saving) return 'tasks.bulkTagsModal.applying';
  if (mode.value === 'remove') return 'tasks.bulkTagsModal.applyRemove';
  if (mode.value === 'replace') {
    return draftTagIds.value.length === 0
      ? 'tasks.bulkTagsModal.applyClearAll'
      : 'tasks.bulkTagsModal.applyReplace';
  }
  return 'tasks.bulkTagsModal.applyAdd';
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      mode.value = 'add';
      draftTagIds.value = [];
      searchQuery.value = '';
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
);

function selectMode(nextMode: BulkTagUpdateMode) {
  const prevMode = mode.value;
  mode.value = nextMode;
  if (nextMode === 'replace' && prevMode !== 'replace' && draftTagIds.value.length === 0) {
    draftTagIds.value = [...tagCoverage.value.commonTagIds];
  }
}

function toggleTag(tagId: EntityId) {
  if (selectedTagSet.value.has(tagId)) {
    draftTagIds.value = draftTagIds.value.filter((id) => id !== tagId);
  } else {
    draftTagIds.value = [...draftTagIds.value, tagId];
  }
}

async function handleCreateInlineTag() {
  if (!creatableTagName.value || !authStore.user || creatingTag.value) return;
  creatingTag.value = true;
  try {
    const created = await catalogStore.createTag({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      projectId: props.projectId,
      name: creatableTagName.value,
    });
    if (!selectedTagSet.value.has(created.id)) {
      draftTagIds.value = [...draftTagIds.value, created.id];
    }
    searchQuery.value = '';
  } finally {
    creatingTag.value = false;
  }
}

function handleSubmit() {
  if (!canApply.value) return;
  emit('apply', {
    mode: mode.value,
    tagIds: [...draftTagIds.value],
  });
}

function handleFormKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    handleSubmit();
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        data-testid="tasks-bulk-tags-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[88svh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none"
        @keydown="handleFormKeydown"
      >
        <div class="signal-line shrink-0" aria-hidden="true" />

        <!-- Header -->
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-border-hairline px-5 py-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <Tag class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <DialogTitle as="h2" class="display-wide text-sm sm:text-base tracking-[0.08em] text-text-primary">
                {{ $t('tasks.bulkTagsModal.title') }}
              </DialogTitle>
            </div>
            <DialogDescription class="tabular-telemetry mt-1 text-ui text-text-muted">
              {{ $t('tasks.bulkTagsModal.subtitle', { count: selectedTasks.length }) }}
            </DialogDescription>
          </div>

          <DialogClose as-child>
            <button
              type="button"
              :aria-label="$t('confirm.cancelAction')"
              class="btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <!-- Mode Selector -->
          <div class="space-y-1.5">
            <div class="label-eyebrow text-text-muted">
              {{ $t('tasks.bulkTagsModal.modeLabel') }}
            </div>
            <div
              role="group"
              :aria-label="$t('tasks.bulkTagsModal.modeLabel')"
              class="grid grid-cols-3 border border-border-input bg-bg-primary"
            >
              <button
                v-for="m in (['add', 'remove', 'replace'] as const)"
                :key="m"
                type="button"
                :data-testid="`bulk-tags-mode-${m}`"
                :aria-pressed="mode === m"
                class="h-9 px-2 text-xs font-semibold uppercase tracking-wider transition-colors"
                :class="
                  mode === m
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                "
                @click="selectMode(m)"
              >
                {{ $t(`tasks.bulkTagsModal.mode_${m}`) }}
              </button>
            </div>
            <p class="text-xs text-text-muted">
              {{ $t(`tasks.bulkTagsModal.modeHint_${mode}`) }}
            </p>
          </div>

          <!-- Search & Create Inline -->
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="relative flex-1">
                <Search
                  class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  ref="searchInputRef"
                  v-model="searchQuery"
                  type="search"
                  data-testid="bulk-tags-search-input"
                  :placeholder="$t('tasks.bulkTagsModal.searchPlaceholder')"
                  class="h-9 w-full border border-border-input bg-bg-primary pl-8 pr-3 text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
                  @keydown.enter.prevent="creatableTagName ? handleCreateInlineTag() : undefined"
                />
              </div>

              <button
                v-if="draftTagIds.length > 0"
                type="button"
                data-testid="bulk-tags-clear-selection"
                class="shrink-0 text-xs font-medium text-text-muted hover:text-signal hover:underline"
                @click="draftTagIds = []"
              >
                {{ $t('tasks.bulkTagsModal.clearSelection') }}
              </button>
            </div>

            <button
              v-if="creatableTagName"
              type="button"
              :disabled="creatingTag"
              data-testid="bulk-tags-create-inline"
              class="flex w-full items-center gap-2 border border-signal/40 bg-signal-soft px-3 py-2 text-left text-xs font-medium text-signal hover:bg-signal/15 transition-colors disabled:opacity-50"
              @click="handleCreateInlineTag"
            >
              <Plus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{{ $t('tasks.bulkTagsModal.createInline', { name: creatableTagName }) }}</span>
            </button>
          </div>

          <!-- Project Tags Checklist -->
          <div class="border border-border-hairline bg-bg-primary">
            <div
              v-if="projectTags.length === 0 && !creatableTagName"
              class="px-3 py-5 text-center text-ui text-text-muted"
            >
              {{ $t('tasks.bulkTagsModal.emptyProjectTags') }}
            </div>

            <div
              v-else-if="filteredTags.length === 0 && !creatableTagName"
              class="px-3 py-5 text-center text-ui text-text-muted"
            >
              {{ $t('tasks.bulkTagsModal.noMatches', { query: searchQuery }) }}
            </div>

            <ul
              v-else
              class="max-h-60 overflow-y-auto divide-y divide-border-subtle"
            >
              <li v-for="tag in filteredTags" :key="tag.id">
                <button
                  type="button"
                  :data-testid="`bulk-tags-option-${tag.id}`"
                  :aria-pressed="selectedTagSet.has(tag.id)"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors hover:bg-bg-hover/70"
                  :class="selectedTagSet.has(tag.id) ? 'bg-signal-soft/70 text-signal font-medium' : 'text-text-primary'"
                  @click="toggleTag(tag.id)"
                >
                  <span class="flex min-w-0 items-center gap-2.5">
                    <span
                      class="inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors"
                      :class="
                        selectedTagSet.has(tag.id)
                          ? 'border-signal bg-signal text-white'
                          : 'border-border-input bg-bg-elevated'
                      "
                      aria-hidden="true"
                    >
                      <Check v-if="selectedTagSet.has(tag.id)" class="h-3 w-3 stroke-[3]" />
                    </span>
                    <span class="truncate">{{ tag.name }}</span>
                  </span>

                  <span
                    v-if="tagCoverage.commonSet.has(tag.id)"
                    class="tabular-telemetry shrink-0 border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-500"
                  >
                    {{ $t('tasks.bulkTagsModal.coverageAll') }}
                  </span>
                  <span
                    v-else-if="tagCoverage.partialSet.has(tag.id)"
                    class="tabular-telemetry shrink-0 border border-border-hairline bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted"
                  >
                    {{ $t('tasks.bulkTagsModal.coverageSome') }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-hairline bg-bg-primary/60 px-5 py-3.5">
          <DialogClose as-child>
            <button
              type="button"
              :disabled="saving"
              class="btn-press inline-flex h-9 items-center border border-border-hairline bg-bg-elevated px-3.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              {{ $t('confirm.cancelAction') }}
            </button>
          </DialogClose>

          <button
            type="button"
            data-testid="bulk-tags-apply-btn"
            :disabled="!canApply"
            class="btn-press tabular-telemetry inline-flex h-9 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleSubmit"
          >
            <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>{{ $t(applyButtonLabelKey, { count: selectedTasks.length }) }}</span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
