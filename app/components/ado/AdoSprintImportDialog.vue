<script setup lang="ts">
import {
  AlertCircle,
  Check,
  Download,
  GitBranch,
  Loader2,
  Search,
  X,
} from 'lucide-vue-next';
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
  parseWorkItemIdInput,
  type AdoErrorCode,
  type AdoSprintWorkItemNode,
} from '~/domain/ado';
import type { EntityId } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';

interface PreviewGroup {
  root: AdoSprintWorkItemNode;
  children: AdoSprintWorkItemNode[];
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    connectionId?: string;
    kloxProjectId: EntityId;
    iterationPath?: string;
  }>(),
  {
    connectionId: undefined,
    iterationPath: undefined,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  imported: [summary: { createdCount: number; updatedCount: number; iterationName: string }];
}>();

const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const prefsStore = usePreferencesStore();
const adoStore = useAdoStore();

const loadingPreview = ref(false);
const importing = ref(false);
const errorCode = ref<AdoErrorCode | null>(null);
const previewOrgUrl = ref('');
const previewProject = ref('');
const previewIterationName = ref('');
const fetchedItems = ref<AdoSprintWorkItemNode[]>([]);
const selectedIds = ref<Set<number>>(new Set());
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

const existingAdoIds = computed(() => {
  const set = new Set<number>();
  for (const t of catalogStore.getTasksForProject(props.kloxProjectId)) {
    if (t.externalProvider !== 'azure_devops') continue;
    const parsed = parseWorkItemIdInput(t.externalWorkItemId);
    if (parsed) set.add(parsed);
  }
  return set;
});

const groupedNodes = computed<PreviewGroup[]>(() => {
  const byId = new Map(fetchedItems.value.map((n) => [n.id, n]));
  const roots: AdoSprintWorkItemNode[] = [];
  const childrenByParent = new Map<number, AdoSprintWorkItemNode[]>();

  for (const node of fetchedItems.value) {
    if (node.depth === 1 && node.parentId && byId.has(node.parentId)) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    } else {
      roots.push(node);
    }
  }

  return roots.map((root) => ({
    root,
    children: childrenByParent.get(root.id) ?? [],
  }));
});

const filteredGroups = computed<PreviewGroup[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return groupedNodes.value;

  const matches = (n: AdoSprintWorkItemNode) =>
    n.title.toLowerCase().includes(q) ||
    String(n.id).includes(q) ||
    n.workItemType.toLowerCase().includes(q);

  const out: PreviewGroup[] = [];
  for (const grp of groupedNodes.value) {
    if (matches(grp.root)) {
      out.push(grp);
    } else {
      const matchingChildren = grp.children.filter(matches);
      if (matchingChildren.length > 0) {
        out.push({ root: grp.root, children: matchingChildren });
      }
    }
  }
  return out;
});

const newItemsCount = computed(
  () => fetchedItems.value.filter((item) => !existingAdoIds.value.has(item.id)).length
);
const existingItemsCount = computed(() => fetchedItems.value.length - newItemsCount.value);
const selectedCount = computed(() => selectedIds.value.size);

async function loadPreview() {
  if (!props.connectionId) return;
  loadingPreview.value = true;
  errorCode.value = null;
  fetchedItems.value = [];
  selectedIds.value = new Set();
  searchQuery.value = '';
  try {
    const res = await adoStore.previewSprintWorkItems({
      isDemo: authStore.isDemoMode,
      connectionId: props.connectionId,
      iterationPath: props.iterationPath || undefined,
      timeZone: prefsStore.preferences.timeZone,
    });
    if (!res.ok) {
      errorCode.value = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }
    previewOrgUrl.value = res.orgUrl;
    previewProject.value = res.project;
    previewIterationName.value = res.iterationName;
    fetchedItems.value = res.items;
    selectedIds.value = new Set(res.items.map((i) => i.id));
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } finally {
    loadingPreview.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void loadPreview();
    }
  }
);

function toggleRootGroup(grp: PreviewGroup) {
  const next = new Set(selectedIds.value);
  const groupIds = [grp.root.id, ...grp.children.map((c) => c.id)];
  const allSelected = groupIds.every((id) => next.has(id));
  for (const id of groupIds) {
    if (allSelected) {
      next.delete(id);
    } else {
      next.add(id);
    }
  }
  selectedIds.value = next;
}

function toggleNode(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

function selectAll() {
  selectedIds.value = new Set(fetchedItems.value.map((i) => i.id));
}

function deselectAll() {
  selectedIds.value = new Set();
}

function selectOnlyNew() {
  selectedIds.value = new Set(
    fetchedItems.value.filter((i) => !existingAdoIds.value.has(i.id)).map((i) => i.id)
  );
}

function isChildOrphanedFromUncheckedParent(child: AdoSprintWorkItemNode): boolean {
  if (!child.parentId || !selectedIds.value.has(child.id)) return false;
  return !selectedIds.value.has(child.parentId) && !existingAdoIds.value.has(child.parentId);
}

async function handleImportSelected() {
  if (!authStore.user || !props.connectionId || selectedIds.value.size === 0 || importing.value) {
    return;
  }
  importing.value = true;
  errorCode.value = null;
  try {
    const chosen = fetchedItems.value.filter((item) => selectedIds.value.has(item.id));
    const res = await adoStore.commitSprintWorkItems({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      connectionId: props.connectionId,
      orgUrl: previewOrgUrl.value,
      project: previewProject.value,
      iterationName: previewIterationName.value,
      nodes: chosen,
    });
    if (!res.ok) {
      errorCode.value = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }
    emit('imported', {
      createdCount: res.createdCount,
      updatedCount: res.updatedCount,
      iterationName: previewIterationName.value,
    });
    emit('update:open', false);
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        data-testid="ado-sprint-import-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[88svh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none"
      >
        <div class="signal-line shrink-0" aria-hidden="true" />

        <!-- Header -->
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-border-hairline px-5 py-4 sm:px-6">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <GitBranch class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <DialogTitle as="h1" class="display-wide text-base tracking-[0.12em] text-text-primary">
                {{ $t('ado.sprintModal.title') }}
              </DialogTitle>
              <span
                v-if="previewIterationName"
                class="tabular-telemetry border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal"
              >
                {{ previewIterationName }}
              </span>
            </div>
            <DialogDescription class="mt-1 text-ui text-text-muted">
              {{ $t('ado.sprintModal.subtitle') }}
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

        <!-- Search & Batch Selection Bar -->
        <div
          v-if="!loadingPreview && fetchedItems.length > 0"
          class="shrink-0 space-y-2.5 border-b border-border-hairline bg-bg-primary/50 px-5 py-3 sm:px-6"
        >
          <div class="flex items-center gap-2 border border-border-input bg-bg-elevated px-3 py-2 focus-within:border-signal">
            <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="$t('ado.sprintModal.searchPlaceholder')"
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

          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="font-medium text-signal hover:underline"
                @click="selectAll"
              >
                {{ $t('ado.sprintModal.selectAll') }}
              </button>
              <button
                v-if="newItemsCount > 0 && existingItemsCount > 0"
                type="button"
                class="font-medium text-signal hover:underline"
                @click="selectOnlyNew"
              >
                {{ $t('ado.sprintModal.selectOnlyNew') }}
              </button>
              <button
                v-if="selectedCount > 0"
                type="button"
                class="text-text-muted hover:text-text-primary hover:underline"
                @click="deselectAll"
              >
                {{ $t('ado.sprintModal.deselectAll') }}
              </button>
            </div>

            <span class="tabular-telemetry text-text-muted">
              {{
                $t('ado.sprintModal.countsSummary', {
                  selected: selectedCount,
                  total: fetchedItems.length,
                  newCount: newItemsCount,
                  existingCount: existingItemsCount,
                })
              }}
            </span>
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-3">
          <div
            v-if="errorCode"
            role="alert"
            class="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-ui text-destructive"
          >
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{{ $t(`ado.errors.${errorCode}`) }}</span>
          </div>

          <div
            v-if="loadingPreview"
            class="flex flex-col items-center justify-center gap-3 py-12 text-ui text-text-muted"
          >
            <Loader2 class="h-5 w-5 animate-spin text-signal" aria-hidden="true" />
            <span>{{ $t('ado.sprintModal.loading') }}</span>
          </div>

          <div
            v-else-if="fetchedItems.length === 0 && !errorCode"
            class="border border-border-hairline bg-bg-primary p-6 text-center text-ui text-text-muted"
          >
            {{ $t('ado.sprintModal.empty') }}
          </div>

          <div
            v-else-if="filteredGroups.length === 0"
            class="border border-border-hairline bg-bg-primary p-6 text-center text-ui text-text-muted"
          >
            {{ $t('ado.picker.noResults') }}
          </div>

          <ul v-else class="divide-y divide-border-hairline border border-border-hairline bg-bg-primary">
            <li v-for="grp in filteredGroups" :key="grp.root.id">
              <!-- Parent / Root Work Item Row -->
              <label
                class="flex cursor-pointer items-start justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-bg-hover/60"
                :class="selectedIds.has(grp.root.id) ? 'bg-signal-soft/30' : ''"
              >
                <span class="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(grp.root.id)"
                    class="mt-1 h-4 w-4 shrink-0 accent-accent"
                    @change="toggleRootGroup(grp)"
                  />
                  <span class="min-w-0 flex-1 space-y-1">
                    <span class="flex flex-wrap items-center gap-1.5">
                      <AdoWorkItemTypeBadge
                        :work-item-type="grp.root.workItemType"
                        :work-item-id="grp.root.id"
                        :url="grp.root.url"
                      />
                      <span
                        class="border px-1.5 py-0.5 text-xs font-medium"
                        :class="
                          existingAdoIds.has(grp.root.id)
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                            : 'border-signal/35 bg-signal-soft text-signal'
                        "
                      >
                        {{
                          existingAdoIds.has(grp.root.id)
                            ? $t('ado.sprintModal.alreadyInKloxBadge')
                            : $t('ado.sprintModal.newBadge')
                        }}
                      </span>
                    </span>
                    <span class="block text-sm font-medium text-text-primary">
                      {{ grp.root.title }}
                    </span>
                  </span>
                </span>

                <span
                  v-if="grp.root.completedWork > 0"
                  class="tabular-telemetry shrink-0 border border-border-hairline bg-bg-elevated px-2 py-0.5 text-xs text-text-muted"
                >
                  {{ grp.root.completedWork.toFixed(2) }}h
                </span>
              </label>

              <!-- Child Work Items -->
              <ul
                v-if="grp.children.length > 0"
                class="divide-y divide-border-subtle border-t border-border-hairline bg-bg-elevated/40"
              >
                <li v-for="child in grp.children" :key="child.id">
                  <label
                    class="flex cursor-pointer items-start justify-between gap-3 py-2.5 pl-9 pr-3.5 transition-colors hover:bg-bg-hover/60 sm:pl-11"
                    :class="selectedIds.has(child.id) ? 'bg-signal-soft/25' : ''"
                  >
                    <span class="flex items-start gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        :checked="selectedIds.has(child.id)"
                        class="mt-1 h-4 w-4 shrink-0 accent-accent"
                        @change="toggleNode(child.id)"
                      />
                      <span class="min-w-0 flex-1 space-y-1">
                        <span class="flex flex-wrap items-center gap-1.5">
                          <AdoWorkItemTypeBadge
                            :work-item-type="child.workItemType"
                            :work-item-id="child.id"
                            :url="child.url"
                          />
                          <span
                            class="border px-1.5 py-0.5 text-xs font-medium"
                            :class="
                              existingAdoIds.has(child.id)
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                : 'border-signal/35 bg-signal-soft text-signal'
                            "
                          >
                            {{
                              existingAdoIds.has(child.id)
                                ? $t('ado.sprintModal.alreadyInKloxBadge')
                                : $t('ado.sprintModal.newBadge')
                            }}
                          </span>
                        </span>
                        <span class="block text-sm text-text-primary">
                          {{ child.title }}
                        </span>
                        <span
                          v-if="isChildOrphanedFromUncheckedParent(child)"
                          class="block text-xs text-amber-500"
                        >
                          {{ $t('ado.sprintModal.orphanChildHint', { parentId: child.parentId }) }}
                        </span>
                      </span>
                    </span>

                    <span class="tabular-telemetry shrink-0 border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted">
                      {{ child.completedWork.toFixed(2) }}h
                    </span>
                  </label>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-hairline bg-bg-primary/50 px-5 py-4 sm:px-6">
          <span class="tabular-telemetry text-xs text-text-muted">
            {{ $t('ado.sprintModal.footerSelection', { count: selectedCount }) }}
          </span>

          <div class="flex items-center gap-2.5">
            <DialogClose as-child>
              <button
                type="button"
                class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:bg-bg-hover"
              >
                <span>{{ $t('confirm.cancelAction') }}</span>
                <BrandKeycapBadge keys="Esc" size="sm" />
              </button>
            </DialogClose>

            <button
              type="button"
              data-testid="ado-sprint-import-confirm-btn"
              :disabled="selectedCount === 0 || importing || loadingPreview"
              class="btn-press inline-flex h-9 items-center gap-2 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-45"
              @click="handleImportSelected"
            >
              <Loader2 v-if="importing" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Download v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {{
                  importing
                    ? $t('ado.sprintModal.importingButton')
                    : $t('ado.sprintModal.confirmButton', { count: selectedCount })
                }}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
