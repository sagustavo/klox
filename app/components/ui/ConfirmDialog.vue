<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next';
import {
  AlertDialogAction,
  AlertDialogCancel,
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
  nextTick(() => {
    confirmBtnRef.value?.focus();
  });
}

function handleOpenChange(next: boolean) {
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
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs" />
      <AlertDialogContent
        :data-testid="testId"
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border border-border-hairline bg-bg-elevated p-5 shadow-2xl focus:outline-none space-y-4"
        @open-auto-focus="handleOpenAutoFocus"
      >
        <div class="flex items-start gap-3">
          <span
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center border"
            :class="
              destructive
                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                : 'border-accent/40 bg-accent/10 text-accent'
            "
          >
            <AlertTriangle class="h-4 w-4" />
          </span>

          <div class="min-w-0 space-y-1.5">
            <AlertDialogTitle class="text-sm font-mono font-semibold uppercase tracking-wider text-text-primary">
              {{ title }}
            </AlertDialogTitle>
            <AlertDialogDescription class="text-xs leading-relaxed text-text-muted">
              {{ description }}
            </AlertDialogDescription>
            <div
              v-if="detail"
              data-testid="confirm-dialog-detail"
              class="mt-2 border border-border-hairline bg-bg-primary px-2.5 py-2 text-xs font-mono text-text-primary break-words"
            >
              {{ detail }}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border-hairline pt-4">
          <AlertDialogCancel as-child>
            <button
              type="button"
              data-testid="confirm-dialog-cancel"
              :disabled="loading"
              class="inline-flex h-8 items-center gap-2 border border-border-hairline bg-bg-primary px-3 text-xs font-mono text-text-primary hover:bg-bg-hover transition-colors focus:outline-none focus-visible:border-accent disabled:opacity-50"
              @click="handleCancel"
            >
              <span>{{ cancelLabel || $t('confirm.cancelAction') }}</span>
              <BrandKeycapBadge keys="Esc" />
            </button>
          </AlertDialogCancel>

          <AlertDialogAction as-child>
            <button
              ref="confirmBtnRef"
              type="button"
              data-testid="confirm-dialog-confirm"
              :disabled="loading"
              class="inline-flex h-8 items-center gap-2 border px-3 text-xs font-mono uppercase transition-colors focus:outline-none focus-visible:ring-1 disabled:opacity-50"
              :class="
                destructive
                  ? 'border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white focus-visible:ring-red-400'
                  : 'border-accent bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent'
              "
              @click.prevent="handleConfirm"
            >
              <span>
                {{
                  loading
                    ? $t('confirm.deletingAction')
                    : confirmLabel || $t('confirm.deleteAction')
                }}
              </span>
              <BrandKeycapBadge keys="Enter" />
            </button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
