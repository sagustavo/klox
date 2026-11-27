<script setup lang="ts">
import { AlertCircle, Loader2, Plus, X } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { secondsToHours2, type AdoErrorCode, type AdoWorkItemSummary } from '~/domain/ado';
import type { EntityId, Task } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';

const props = withDefaults(
  defineProps<{
    open: boolean;
    task: Task | null;
    orgUrl?: string;
    project?: string;
    defaultWorkItemType?: string;
    unsyncedSeconds?: number;
    unsyncedLogIds?: readonly EntityId[];
  }>(),
  {
    orgUrl: undefined,
    project: undefined,
    defaultWorkItemType: undefined,
    unsyncedSeconds: 0,
    unsyncedLogIds: () => [],
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  created: [payload: { taskId: EntityId; item: AdoWorkItemSummary & { orgUrl: string; project: string } }];
}>();

const authStore = useAuthStore();
const adoStore = useAdoStore();

const titleInput = ref('');
const selectedProject = ref('');
const selectedType = ref('Task');
const pushInitialHours = ref(true);
const submitting = ref(false);
const errorCode = ref<AdoErrorCode | null>(null);
const titleInputRef = ref<HTMLInputElement | null>(null);

const recommendedHours = computed(() => secondsToHours2(props.unsyncedSeconds ?? 0));

const availableTypes = computed(() => {
  if (adoStore.workItemTypes.length > 0) return adoStore.workItemTypes;
  return [
    { name: 'Task', supportsCompletedWork: true },
    { name: 'Bug', supportsCompletedWork: true },
    { name: 'Product Backlog Item', supportsCompletedWork: false },
  ];
});

const selectedTypeSupportsCompletedWork = computed(() => {
  if (adoStore.workItemTypes.length === 0) return true;
  const found = adoStore.workItemTypes.find(
    (t) => t.name.toLowerCase() === selectedType.value.toLowerCase()
  );
  return found ? found.supportsCompletedWork : true;
});

watch(
  () => [props.open, props.task] as const,
  async ([isOpen, task]) => {
    if (!isOpen || !task) return;
    errorCode.value = null;
    titleInput.value = task.name;
    selectedProject.value = props.project || adoStore.connection?.defaultProject || '';
    selectedType.value =
      props.defaultWorkItemType || adoStore.connection?.defaultWorkItemType || 'Task';
    pushInitialHours.value = recommendedHours.value > 0;
    nextTick(() => {
      titleInputRef.value?.focus();
    });
    if (adoStore.isConnected && adoStore.workItemTypes.length === 0) {
      await adoStore.fetchProjectsAndTypes({
        isDemo: authStore.isDemoMode,
        orgUrl: props.orgUrl,
        project: selectedProject.value,
      });
    }
  }
);

async function handleProjectChange() {
  if (!adoStore.isConnected) return;
  await adoStore.fetchProjectsAndTypes({
    isDemo: authStore.isDemoMode,
    orgUrl: props.orgUrl,
    project: selectedProject.value,
  });
}

async function handleSubmit() {
  if (!authStore.user || !props.task || submitting.value) return;
  if (!titleInput.value.trim()) {
    errorCode.value = 'ADO_INVALID_INPUT';
    return;
  }

  submitting.value = true;
  errorCode.value = null;
  try {
    const res = await adoStore.createWorkItemForTask({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      taskId: props.task.id,
      orgUrl: props.orgUrl,
      project: selectedProject.value,
      workItemType: selectedType.value,
      title: titleInput.value.trim(),
      initialCompletedWork:
        pushInitialHours.value && selectedTypeSupportsCompletedWork.value
          ? recommendedHours.value
          : 0,
      initialLogIds:
        pushInitialHours.value && selectedTypeSupportsCompletedWork.value
          ? props.unsyncedLogIds
          : [],
    });

    if (!res.ok || !res.item) {
      errorCode.value = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }

    emit('created', { taskId: props.task.id, item: res.item });
    emit('update:open', false);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        data-testid="ado-create-work-item-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-border-hairline bg-bg-elevated p-6 shadow-2xl overscroll-contain focus:outline-none space-y-5"
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

        <div class="flex items-start justify-between gap-4 border-b border-border-hairline pb-4">
          <div>
            <DialogTitle as="h1" class="display-wide text-base tracking-[0.12em] text-text-primary">
              {{ $t('ado.createModal.title') }}
            </DialogTitle>
            <DialogDescription class="mt-1.5 text-ui text-text-muted">
              {{ $t('ado.createModal.subtitle') }}
            </DialogDescription>
          </div>

          <DialogClose as-child>
            <button
              type="button"
              :aria-label="$t('confirm.cancelAction')"
              class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <div
          v-if="errorCode"
          role="alert"
          class="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-ui text-destructive"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ $t(`ado.errors.${errorCode}`) }}</span>
        </div>

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label for="ado-create-title" class="label-eyebrow block text-text-muted">
              {{ $t('ado.createModal.titleLabel') }}
            </label>
            <input
              id="ado-create-title"
              ref="titleInputRef"
              v-model="titleInput"
              type="text"
              required
              maxlength="255"
              class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label for="ado-create-project" class="label-eyebrow block text-text-muted">
                {{ $t('ado.createModal.projectLabel') }}
              </label>
              <select
                v-if="adoStore.projects.length > 0"
                id="ado-create-project"
                v-model="selectedProject"
                class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
                @change="handleProjectChange"
              >
                <option v-for="proj in adoStore.projects" :key="proj.id" :value="proj.name">
                  {{ proj.name }}
                </option>
              </select>
              <input
                v-else
                id="ado-create-project"
                v-model="selectedProject"
                type="text"
                required
                class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
              />
            </div>

            <div>
              <label for="ado-create-type" class="label-eyebrow block text-text-muted">
                {{ $t('ado.createModal.typeLabel') }}
              </label>
              <select
                id="ado-create-type"
                v-model="selectedType"
                class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
              >
                <option v-for="wt in availableTypes" :key="wt.name" :value="wt.name">
                  {{ wt.name }}
                </option>
              </select>
            </div>
          </div>

          <div
            v-if="recommendedHours > 0"
            class="border border-border-hairline bg-bg-primary p-3.5 space-y-2"
          >
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input
                v-model="pushInitialHours"
                type="checkbox"
                :disabled="!selectedTypeSupportsCompletedWork"
                class="mt-0.5 h-4 w-4 accent-accent"
              />
              <span class="text-ui text-text-primary">
                {{ $t('ado.createModal.pushInitialHours', { hours: recommendedHours.toFixed(2) }) }}
              </span>
            </label>
            <p v-if="!selectedTypeSupportsCompletedWork" class="text-xs text-amber-500">
              {{ $t('ado.scrumNotice.typeMissingField', { type: selectedType }) }}
            </p>
          </div>

          <div class="flex items-center justify-end gap-2.5 border-t border-border-hairline pt-4">
            <DialogClose as-child>
              <button
                type="button"
                :disabled="submitting"
                class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:bg-bg-hover"
              >
                <span>{{ $t('confirm.cancelAction') }}</span>
                <BrandKeycapBadge keys="Esc" size="sm" />
              </button>
            </DialogClose>

            <button
              type="submit"
              :disabled="submitting"
              class="btn-press inline-flex h-9 items-center gap-1.5 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              <Loader2 v-if="submitting" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Plus v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('ado.createModal.submitButton') }}</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
