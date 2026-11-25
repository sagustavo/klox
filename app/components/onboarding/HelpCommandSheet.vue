<script setup lang="ts">
import { Compass, Keyboard, ListChecks, SlidersHorizontal, X } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useOnboardingStore } from '~/stores/onboarding';

const onboardingStore = useOnboardingStore();
const localePath = useLocalePath();
const { isRecording, getKeycaps, getFormattedText, matchesCommand } = useShortcuts();

function onGlobalKeydown(event: KeyboardEvent) {
  if (isRecording.value) return;
  if (document.querySelector('[role="alertdialog"]')) {
    return;
  }
  if (!onboardingStore.isHelpSheetOpen && document.querySelector('[role="dialog"]')) {
    return;
  }

  if (matchesCommand(event, 'ui.toggleHelp')) {
    event.preventDefault();
    onboardingStore.isHelpSheetOpen = !onboardingStore.isHelpSheetOpen;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});

async function handleReplayTour() {
  onboardingStore.startTour();
  await navigateTo(localePath('/app'));
}

async function handleRestoreChecklist() {
  onboardingStore.restoreChecklist();
  await navigateTo(localePath('/app'));
}

async function handleRerunWizard() {
  onboardingStore.isHelpSheetOpen = false;
  await navigateTo(localePath('/app/welcome'));
}

async function handleCustomizeShortcuts() {
  onboardingStore.isHelpSheetOpen = false;
  await navigateTo(localePath('/app/settings#shortcuts'));
}
</script>

<template>
  <DialogRoot
    :open="onboardingStore.isHelpSheetOpen"
    @update:open="onboardingStore.isHelpSheetOpen = $event"
  >
    <DialogPortal>
      <DialogOverlay class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overscroll-contain" />
      <DialogContent
        class="orbital-dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-border-hairline bg-bg-elevated p-6 shadow-2xl overscroll-contain focus:outline-none space-y-5"
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

        <div class="flex items-start justify-between gap-4 border-b border-border-hairline pb-4">
          <div>
            <DialogTitle class="display-wide text-base tracking-[0.12em] text-text-primary">
              {{ $t('onboarding.help.title') }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-ui text-text-muted">
              <BrandWithKeys
                :text="$t('onboarding.help.subtitle', { helpKey: getFormattedText('ui.toggleHelp') })"
              />
            </DialogDescription>
          </div>

          <DialogClose as-child>
            <button
              type="button"
              class="btn-press inline-flex h-8 shrink-0 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              <X class="h-3.5 w-3.5" />
              <span>{{ $t('onboarding.help.close') }}</span>
            </button>
          </DialogClose>
        </div>

        <!-- Shortcuts Table -->
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutN') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('timer.new')" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutS') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('timer.stop')" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutResumeLast') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('timer.resumeLast')" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutTab') }}</span>
            <BrandKeycapBadge keys="Tab" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutAi') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('timer.aiAutofill')" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutEsc') }}</span>
            <BrandKeycapBadge keys="Esc" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutSidebar') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
          </div>
          <div class="flex items-center justify-between gap-3 border border-border-hairline bg-bg-primary px-3.5 py-2.5">
            <span class="text-text-primary">{{ $t('onboarding.help.shortcutHelp') }}</span>
            <BrandKeycapBadge :keys="getKeycaps('ui.toggleHelp')" size="sm" />
          </div>
        </div>

        <div class="flex justify-end">
          <button
            type="button"
            data-testid="help-customize-shortcuts"
            class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-signal hover:border-signal transition-colors"
            @click="handleCustomizeShortcuts"
          >
            <Keyboard class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('onboarding.help.customizeShortcuts') }}</span>
          </button>
        </div>

        <!-- Onboarding Actions -->
        <div class="border-t border-border-hairline pt-4 space-y-2.5">
          <div class="label-eyebrow text-text-muted">
            {{ $t('onboarding.help.actionsTitle') }}
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              class="btn-press flex items-center gap-2 border border-signal/50 bg-signal-soft px-3.5 py-2.5 text-left text-ui font-medium text-signal hover:bg-accent hover:border-accent hover:text-white transition-colors"
              @click="handleReplayTour"
            >
              <Compass class="h-4 w-4 shrink-0" />
              <span>{{ $t('onboarding.help.replayTour') }}</span>
            </button>

            <button
              type="button"
              class="btn-press flex items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 py-2.5 text-left text-ui font-medium text-text-primary hover:border-signal transition-colors"
              @click="handleRestoreChecklist"
            >
              <ListChecks class="h-4 w-4 shrink-0 text-signal" />
              <span>{{ $t('onboarding.help.showChecklist') }}</span>
            </button>

            <button
              type="button"
              class="btn-press flex items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 py-2.5 text-left text-ui font-medium text-text-primary hover:border-signal transition-colors"
              @click="handleRerunWizard"
            >
              <SlidersHorizontal class="h-4 w-4 shrink-0 text-signal" />
              <span>{{ $t('onboarding.help.rerunWizard') }}</span>
            </button>
          </div>
        </div>

        <!-- Support Contact Footer -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border-hairline pt-4 text-ui text-text-muted">
          <span>{{ $t('onboarding.help.supportLabel') }}</span>
          <a
            href="mailto:contact@klox.dev"
            class="text-signal hover:underline"
          >
            contact@klox.dev
          </a>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
