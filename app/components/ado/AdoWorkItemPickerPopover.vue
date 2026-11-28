<script setup lang="ts">
import { Link2, Loader2, Search, Unlink, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import {
  buildAdoWorkItemWebUrl,
  parseWorkItemIdInput,
  type AdoErrorCode,
  type AdoWorkItemSummary,
} from '~/domain/ado';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';

export interface AdoSelectedWorkItem {
  id: number;
  title: string;
  workItemType: string;
  completedWork: number;
  url: string;
  orgUrl: string;
  project: string;
}

const props = withDefaults(
  defineProps<{
    connectionId?: string;
    workItemId?: string;
    workItemTitle?: string;
    completedWorkHours?: number;
    orgUrl?: string;
    project?: string;
    variant?: 'field' | 'pill';
    testId?: string;
  }>(),
  {
    connectionId: undefined,
    workItemId: undefined,
    workItemTitle: undefined,
    completedWorkHours: 0,
    orgUrl: undefined,
    project: undefined,
    variant: 'field',
    testId: undefined,
  }
);

const emit = defineEmits<{
  select: [item: AdoSelectedWorkItem | null];
}>();

const authStore = useAuthStore();
const adoStore = useAdoStore();

const open = ref(false);
const searchQuery = ref('');
const results = ref<AdoWorkItemSummary[]>([]);
const searching = ref(false);
const errorCode = ref<AdoErrorCode | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const parsedDirectId = computed(() => parseWorkItemIdInput(searchQuery.value));

const activeConn = computed(
  () => adoStore.getConnectionById(props.connectionId) ?? adoStore.connection
);
const canSearchAdo = computed(() => Boolean(activeConn.value?.connected));

const effectiveOrgUrl = computed(
  () => props.orgUrl?.trim() || activeConn.value?.orgUrl || ''
);
const effectiveProject = computed(
  () => props.project?.trim() || activeConn.value?.defaultProject || ''
);

async function runSearch(query: string) {
  if (!canSearchAdo.value) {
    results.value = [];
    return;
  }
  searching.value = true;
  errorCode.value = null;
  try {
    const res = await adoStore.searchWorkItems({
      isDemo: authStore.isDemoMode,
      connectionId: activeConn.value?.id,
      orgUrl: effectiveOrgUrl.value || undefined,
      project: effectiveProject.value || undefined,
      query,
    });
    results.value = res.items;
    errorCode.value = res.errorCode ?? null;
  } finally {
    searching.value = false;
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    errorCode.value = null;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
    if (canSearchAdo.value) {
      void runSearch('');
    }
  }
});

watch(searchQuery, (next) => {
  if (!open.value || !canSearchAdo.value) return;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runSearch(next);
  }, 240);
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function handlePickItem(item: AdoWorkItemSummary) {
  emit('select', {
    id: item.id,
    title: item.title,
    workItemType: item.workItemType,
    completedWork: item.completedWork,
    url: item.url,
    orgUrl: effectiveOrgUrl.value,
    project: effectiveProject.value,
  });
  open.value = false;
}

function handleLinkManualId() {
  const id = parsedDirectId.value;
  if (!id) return;
  const orgUrl = effectiveOrgUrl.value || 'https://dev.azure.com';
  const project = effectiveProject.value || '';
  emit('select', {
    id,
    title: `#${id}`,
    workItemType: adoStore.connection?.defaultWorkItemType || 'Task',
    completedWork: 0,
    url: project ? buildAdoWorkItemWebUrl(orgUrl, project, id) : '',
    orgUrl,
    project,
  });
  open.value = false;
}

function handleClearLink() {
  emit('select', null);
  open.value = false;
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        v-if="variant === 'field'"
        type="button"
        :data-testid="testId ?? 'ado-picker-field-trigger'"
        class="inline-flex h-10 w-full items-center justify-between gap-2 border border-border-input bg-bg-primary px-3 text-left text-ui transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal"
      >
        <span class="inline-flex items-center gap-2 min-w-0 truncate">
          <Link2 class="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden="true" />
          <span v-if="workItemId" class="tabular-telemetry truncate font-medium text-text-primary">
            #{{ workItemId }}<span v-if="workItemTitle" class="text-text-muted"> · {{ workItemTitle }}</span>
          </span>
          <span v-else class="truncate text-text-faint">
            {{ $t('ado.picker.placeholder') }}
          </span>
        </span>
      </button>

      <button
        v-else
        type="button"
        :data-testid="testId ?? 'ado-picker-pill-trigger'"
        class="btn-press inline-flex items-center gap-1.5 border border-border-hairline bg-bg-elevated px-2.5 py-1 text-xs font-medium text-text-muted hover:border-signal hover:text-signal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <Link2 class="h-3 w-3 shrink-0" aria-hidden="true" />
        <span v-if="workItemId" class="tabular-telemetry">
          #{{ workItemId }}
        </span>
        <span v-else>{{ $t('ado.picker.linkButton') }}</span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        class="orbital-popover relative z-50 w-80 sm:w-96 overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line" aria-hidden="true" />
        <div class="flex items-center gap-2 border-b border-border-hairline bg-bg-primary/60 px-3 py-2.5">
          <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('ado.picker.searchPlaceholder')"
            class="w-full bg-transparent text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
            @keydown.enter.prevent="parsedDirectId && results.length === 0 ? handleLinkManualId() : undefined"
          />
          <Loader2 v-if="searching" class="h-3.5 w-3.5 shrink-0 animate-spin text-signal" aria-hidden="true" />
          <button
            v-if="searchQuery"
            type="button"
            class="text-text-muted hover:text-text-primary"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div
          v-if="workItemId"
          class="flex items-center justify-between gap-2 border-b border-border-hairline bg-bg-primary/30 px-3 py-2 text-xs"
        >
          <span class="tabular-telemetry text-text-muted truncate">
            {{ $t('ado.picker.currentlyLinked', { id: workItemId }) }}
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-destructive hover:underline shrink-0"
            @click="handleClearLink"
          >
            <Unlink class="h-3 w-3" aria-hidden="true" />
            <span>{{ $t('ado.picker.unlinkAction') }}</span>
          </button>
        </div>

        <div v-if="errorCode" class="border-b border-border-hairline bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {{ $t(`ado.errors.${errorCode}`) }}
        </div>

        <div v-if="!canSearchAdo && !parsedDirectId" class="px-3 py-4 text-center text-ui text-text-muted">
          {{ $t('ado.picker.notConnectedHint') }}
        </div>

        <ul v-else-if="results.length > 0" class="max-h-60 overflow-y-auto divide-y divide-border-subtle">
          <li v-for="item in results" :key="item.id">
            <button
              type="button"
              class="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-ui transition-colors hover:bg-bg-hover"
              :class="String(item.id) === workItemId ? 'bg-signal-soft text-signal font-medium' : 'text-text-primary'"
              @click="handlePickItem(item)"
            >
              <div class="min-w-0 space-y-1">
                <AdoWorkItemTypeBadge
                  :work-item-type="item.workItemType"
                  :work-item-id="item.id"
                />
                <div class="truncate text-ui text-text-primary">
                  {{ item.title }}
                </div>
              </div>
              <span class="tabular-telemetry shrink-0 border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs text-text-muted">
                {{ item.completedWork.toFixed(2) }}h
              </span>
            </button>
          </li>
        </ul>

        <div v-else-if="!searching && !parsedDirectId" class="px-3 py-4 text-center text-ui text-text-muted">
          {{ $t('ado.picker.noResults') }}
        </div>

        <button
          v-if="parsedDirectId"
          type="button"
          class="flex w-full items-center justify-between gap-2 border-t border-border-hairline bg-signal-soft/60 px-3 py-2.5 text-left text-ui font-medium text-signal hover:bg-signal-soft transition-colors"
          @click="handleLinkManualId"
        >
          <span class="tabular-telemetry">
            {{ $t('ado.picker.linkDirectId', { id: parsedDirectId }) }}
          </span>
          <BrandKeycapBadge keys="Enter" size="sm" />
        </button>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
