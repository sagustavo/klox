<script setup lang="ts">
import { Compass, ListChecks, SlidersHorizontal, X } from 'lucide-vue-next';
import { useOnboardingStore } from '~/stores/onboarding';

const onboardingStore = useOnboardingStore();
const localePath = useLocalePath();

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (document.querySelector('[role="alertdialog"], [role="dialog"]')) {
    return;
  }

  if (event.key === '?' && !isEditableElement(document.activeElement)) {
    event.preventDefault();
    onboardingStore.isHelpSheetOpen = !onboardingStore.isHelpSheetOpen;
    return;
  }

  if (event.key === 'Escape' && onboardingStore.isHelpSheetOpen) {
    onboardingStore.isHelpSheetOpen = false;
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
</script>

<template>
  <div
    v-if="onboardingStore.isHelpSheetOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    @click.self="onboardingStore.isHelpSheetOpen = false"
  >
    <div class="w-full max-w-xl border border-border-hairline bg-bg-elevated p-6 shadow-2xl space-y-5">
      <div class="flex items-start justify-between gap-4 border-b border-border-hairline pb-3">
        <div>
          <h2 class="text-sm font-mono font-semibold uppercase tracking-wider text-text-primary">
            {{ $t('onboarding.help.title') }}
          </h2>
          <p class="mt-0.5 text-xs text-text-muted">
            {{ $t('onboarding.help.subtitle') }}
          </p>
        </div>

        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2.5 text-[11px] font-mono text-text-muted hover:text-text-primary"
          @click="onboardingStore.isHelpSheetOpen = false"
        >
          <X class="h-3.5 w-3.5" />
          <span>{{ $t('onboarding.help.close') }}</span>
        </button>
      </div>

      <!-- Shortcuts Table -->
      <div class="space-y-2 text-xs">
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutN') }}</span>
          <BrandKeycapBadge keys="N" />
        </div>
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutS') }}</span>
          <BrandKeycapBadge keys="S" />
        </div>
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutTab') }}</span>
          <BrandKeycapBadge keys="Tab" />
        </div>
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutAi') }}</span>
          <BrandKeycapBadge :keys="['⌘', 'I']" />
        </div>
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutEsc') }}</span>
          <BrandKeycapBadge keys="Esc" />
        </div>
        <div class="flex items-center justify-between border border-border-hairline bg-bg-primary px-3 py-2">
          <span class="text-text-primary">{{ $t('onboarding.help.shortcutHelp') }}</span>
          <BrandKeycapBadge keys="?" />
        </div>
      </div>

      <!-- Onboarding Actions -->
      <div class="border-t border-border-hairline pt-4 space-y-2">
        <div class="text-[11px] font-mono uppercase tracking-wider text-text-muted">
          {{ $t('onboarding.help.actionsTitle') }}
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            class="flex items-center gap-2 border border-accent/50 bg-accent/10 px-3 py-2 text-left text-xs font-mono text-accent hover:bg-accent hover:text-white transition-colors"
            @click="handleReplayTour"
          >
            <Compass class="h-3.5 w-3.5 shrink-0" />
            <span>{{ $t('onboarding.help.replayTour') }}</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-2 text-left text-xs font-mono text-text-primary hover:border-accent transition-colors"
            @click="handleRestoreChecklist"
          >
            <ListChecks class="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{{ $t('onboarding.help.showChecklist') }}</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-2 text-left text-xs font-mono text-text-primary hover:border-accent transition-colors"
            @click="handleRerunWizard"
          >
            <SlidersHorizontal class="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{{ $t('onboarding.help.rerunWizard') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
