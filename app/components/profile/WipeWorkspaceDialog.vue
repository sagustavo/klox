<script setup lang="ts">
import { AlertCircle, AlertTriangle, Download, Loader2, Trash2 } from 'lucide-vue-next';
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';
import type { WorkspaceWipeStage } from '~/composables/useWorkspaceWipe';

const props = defineProps<{
  open: boolean;
  projectCount: number;
  tagCount: number;
  taskCount: number;
  logCount: number;
  hasActiveTimer: boolean;
  stage: WorkspaceWipeStage;
  isStreaming: boolean;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const { t } = useI18n();
const confirmInput = ref('');
const hasInteracted = ref(false);
const hasCommittedBlur = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
const errorId = useId();
const hintId = useId();

const isWiping = computed(
  () =>
    props.stage === 'hydrating' ||
    props.stage === 'backing_up' ||
    props.stage === 'deleting'
);

const requiredKeyword = computed(() => t('wipe.confirmKeyword').trim().toUpperCase());
const isKeywordMatched = computed(
  () => confirmInput.value.trim().toUpperCase() === requiredKeyword.value
);

const showValidationError = computed(
  () => hasCommittedBlur.value && hasInteracted.value && !isKeywordMatched.value
);

const canConfirm = computed(
  () => isKeywordMatched.value && !isWiping.value && !props.isStreaming
);

const stageLabel = computed(() => {
  if (props.stage === 'hydrating') return t('wipe.stageHydrating');
  if (props.stage === 'backing_up') return t('wipe.stageBackingUp');
  if (props.stage === 'deleting') return t('wipe.stageDeleting');
  return t('wipe.confirmButton');
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      confirmInput.value = '';
      hasInteracted.value = false;
      hasCommittedBlur.value = false;
    }
  }
);

function handleOpenAutoFocus(event: Event) {
  event.preventDefault();
  nextTick(() => {
    inputRef.value?.focus({ preventScroll: true });
  });
}

function handleOpenChange(next: boolean) {
  if (!next && isWiping.value) return;
  emit('update:open', next);
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (isWiping.value) {
    event.preventDefault();
  }
}

function handleSubmit() {
  hasInteracted.value = true;
  hasCommittedBlur.value = true;
  if (!canConfirm.value) {
    inputRef.value?.focus();
    return;
  }
  emit('confirm');
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="handleOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay
        class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain"
      />
      <AlertDialogContent
        data-testid="wipe-workspace-dialog"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-destructive/50 bg-bg-elevated p-6 shadow-2xl overscroll-contain focus:outline-none space-y-5"
        @open-auto-focus="handleOpenAutoFocus"
        @escape-key-down="handleEscapeKeyDown"
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

        <div class="flex items-start gap-3.5">
          <span
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-destructive/50 bg-destructive/10 text-destructive"
          >
            <AlertTriangle class="h-5 w-5" aria-hidden="true" />
          </span>

          <div class="min-w-0 space-y-1.5">
            <AlertDialogTitle class="display-wide text-base tracking-[0.12em] text-text-primary">
              {{ $t('wipe.dialogTitle') }}
            </AlertDialogTitle>
            <AlertDialogDescription class="text-sm leading-relaxed text-text-muted">
              {{ $t('wipe.dialogDesc') }}
            </AlertDialogDescription>
          </div>
        </div>

        <!-- Workspace Item Counters -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="border border-border-hairline bg-bg-primary px-3 py-2">
            <div class="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {{ $t('wipe.countProjects') }}
            </div>
            <div class="display-wide tabular-telemetry mt-1 text-base text-text-primary">
              {{ projectCount }}
            </div>
          </div>

          <div class="border border-border-hairline bg-bg-primary px-3 py-2">
            <div class="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {{ $t('wipe.countTags') }}
            </div>
            <div class="display-wide tabular-telemetry mt-1 text-base text-text-primary">
              {{ tagCount }}
            </div>
          </div>

          <div class="border border-border-hairline bg-bg-primary px-3 py-2">
            <div class="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {{ $t('wipe.countTasks') }}
            </div>
            <div class="display-wide tabular-telemetry mt-1 text-base text-text-primary">
              {{ taskCount }}
            </div>
          </div>

          <div class="border border-border-hairline bg-bg-primary px-3 py-2">
            <div class="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {{ $t('wipe.countLogs') }}
            </div>
            <div class="display-wide tabular-telemetry mt-1 text-base text-text-primary">
              {{ logCount }}
            </div>
          </div>
        </div>

        <!-- Automatic CSV Backup Notice -->
        <div class="flex items-start gap-2.5 border border-signal/40 bg-signal-soft p-3 text-ui text-signal">
          <Download class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ $t('wipe.backupNotice') }}</span>
        </div>

        <div
          v-if="hasActiveTimer"
          class="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500"
        >
          {{ $t('wipe.activeTimerNotice') }}
        </div>

        <div
          v-if="errorMessage"
          role="alert"
          class="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ $t('wipe.backupFailedError') }}</span>
        </div>

        <form class="space-y-4" novalidate @submit.prevent="handleSubmit">
          <div>
            <label for="wipe-confirm-input" class="label-eyebrow block text-text-muted">
              {{ $t('wipe.confirmPrompt', { keyword: requiredKeyword }) }}
            </label>
            <p :id="hintId" class="mt-1 text-xs text-text-faint">
              {{ $t('wipe.confirmHint', { keyword: requiredKeyword }) }}
            </p>
            <input
              id="wipe-confirm-input"
              ref="inputRef"
              v-model="confirmInput"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              :disabled="isWiping"
              :aria-invalid="showValidationError ? 'true' : 'false'"
              :aria-describedby="showValidationError ? `${hintId} ${errorId}` : hintId"
              :placeholder="requiredKeyword"
              class="tabular-telemetry mt-2 h-10 w-full border bg-bg-primary px-3 text-sm uppercase text-text-primary placeholder:text-text-faint focus:outline-none disabled:opacity-50"
              :class="
                showValidationError
                  ? 'border-destructive focus:border-destructive'
                  : 'border-border-input focus:border-signal'
              "
              @input="hasInteracted = true"
              @blur="hasCommittedBlur = true"
            />
            <p
              v-if="showValidationError"
              :id="errorId"
              class="mt-1.5 flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{{ $t('wipe.confirmMismatchError', { keyword: requiredKeyword }) }}</span>
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2.5 border-t border-border-hairline pt-4">
            <button
              type="button"
              data-testid="wipe-dialog-cancel"
              :disabled="isWiping"
              class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
              @click="handleOpenChange(false)"
            >
              <span>{{ $t('confirm.cancelAction') }}</span>
              <BrandKeycapBadge keys="Esc" size="sm" />
            </button>

            <button
              type="submit"
              data-testid="wipe-dialog-confirm"
              :disabled="!canConfirm"
              class="btn-press inline-flex h-9 items-center gap-2 border border-destructive/60 bg-destructive/15 px-4 text-xs font-semibold uppercase tracking-wider text-destructive transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:pointer-events-none disabled:opacity-45"
            >
              <Loader2 v-if="isWiping" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Trash2 v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ isStreaming ? $t('wipe.waitStreaming') : stageLabel }}</span>
            </button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
