<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next';
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    loading?: boolean;
    testId?: string;
  }>(),
  {
    detail: undefined,
    confirmLabel: undefined,
    cancelLabel: undefined,
    destructive: true,
    loading: false,
    testId: 'confirm-dialog',
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const confirmBtnRef = ref<HTMLButtonElement | null>(null);

function handleOpenAutoFocus(event: Event) {
  event.preventDefault();
  if (confirmBtnRef.value) {
    confirmBtnRef.value.focus({ preventScroll: true });
  } else {
    nextTick(() => {
      confirmBtnRef.value?.focus({ preventScroll: true });
    });
  }
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (props.loading) {
    event.preventDefault();
  }
}

function handleContentEnter(event: KeyboardEvent) {
  if (props.loading || event.isComposing) return;
  // Let focused interactive controls (Cancel / Confirm buttons) handle native Enter once.
  if (
    event.target instanceof HTMLElement &&
    event.target.closest('button, a, input, select, textarea')
  ) {
    return;
  }
  event.preventDefault();
  handleConfirm();
}

function handleOpenChange(next: boolean) {
  if (!next && props.loading) return;
  emit('update:open', next);
  if (!next) {
    emit('cancel');
  }
}

function handleConfirm() {
  if (props.loading) return;
  emit('confirm');
}

function handleCancel() {
  if (props.loading) return;
  emit('update:open', false);
  emit('cancel');
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="handleOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <AlertDialogContent
        :data-testid="testId"
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-border-hairline bg-bg-elevated p-6 shadow-2xl overscroll-contain focus:outline-none space-y-5"
        @open-auto-focus="handleOpenAutoFocus"
        @escape-key-down="handleEscapeKeyDown"
        @keydown.enter="handleContentEnter"
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <div class="flex items-start gap-3.5">
          <span
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center border"
            :class="
              destructive
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-signal/40 bg-signal-soft text-signal'
            "
          >
            <AlertTriangle class="h-4 w-4" />
          </span>

          <div class="min-w-0 space-y-2">
            <AlertDialogTitle class="display-wide text-base tracking-[0.12em] text-text-primary">
              {{ title }}
            </AlertDialogTitle>
            <AlertDialogDescription class="text-sm leading-relaxed text-text-muted">
              {{ description }}
            </AlertDialogDescription>
            <div
              v-if="detail"
              data-testid="confirm-dialog-detail"
              class="mt-2 border border-border-hairline bg-bg-primary px-3 py-2 text-ui font-medium text-text-primary break-words"
            >
              {{ detail }}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2.5 border-t border-border-hairline pt-4">
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            :disabled="loading"
            class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
            @click="handleCancel"
          >
            <span>{{ cancelLabel || $t('confirm.cancelAction') }}</span>
            <BrandKeycapBadge keys="Esc" size="sm" />
          </button>

          <button
            ref="confirmBtnRef"
            type="button"
            data-testid="confirm-dialog-confirm"
            :disabled="loading"
            class="btn-press inline-flex h-9 items-center gap-2 border px-3.5 text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            :class="
              destructive
                ? 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-red-600 hover:border-red-600 hover:text-white focus-visible:outline-destructive'
                : 'border-accent bg-accent text-white hover:bg-accent-hover focus-visible:outline-signal'
            "
            @click="handleConfirm"
          >
            <span>
              {{
                loading
                  ? $t('confirm.deletingAction')
                  : confirmLabel || $t('confirm.deleteAction')
              }}
            </span>
            <BrandKeycapBadge keys="Enter" size="sm" />
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
