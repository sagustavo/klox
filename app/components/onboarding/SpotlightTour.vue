<script setup lang="ts">
import { Compass, ArrowRight, X } from 'lucide-vue-next';
import { useOnboardingStore } from '~/stores/onboarding';

const { t } = useI18n();
const onboardingStore = useOnboardingStore();
const { getKeycaps, matchesCommand } = useShortcuts();

const stepMeta = computed(() => {
  const step = onboardingStore.tourStep;
  const map: Record<number, { title: string; body: string; keycap: string | string[]; targetAttr: string }> = {
    1: {
      title: t('onboarding.tour.step1Title'),
      body: t('onboarding.tour.step1Body'),
      keycap: getKeycaps('timer.new'),
      targetAttr: 'timer-description',
    },
    2: {
      title: t('onboarding.tour.step2Title'),
      body: t('onboarding.tour.step2Body'),
      keycap: 'A-Z',
      targetAttr: 'timer-description',
    },
    3: {
      title: t('onboarding.tour.step3Title'),
      body: t('onboarding.tour.step3Body'),
      keycap: 'Tab',
      targetAttr: 'timer-project',
    },
    4: {
      title: t('onboarding.tour.step4Title'),
      body: t('onboarding.tour.step4Body'),
      keycap: getKeycaps('timer.aiAutofill'),
      targetAttr: 'timer-description',
    },
    5: {
      title: t('onboarding.tour.step5Title'),
      body: t('onboarding.tour.step5Body'),
      keycap: 'Enter',
      targetAttr: 'timer-submit',
    },
    6: {
      title: t('onboarding.tour.step6Title'),
      body: t('onboarding.tour.step6Body'),
      keycap: getKeycaps('timer.stop'),
      targetAttr: 'timer-submit',
    },
  };
  return map[step] ?? map[1]!;
});

function highlightTargetElement(attrName: string | undefined) {
  if (import.meta.server) return;
  document.querySelectorAll('[data-tour]').forEach((el) => {
    el.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-bg-primary');
  });
  if (!attrName || !onboardingStore.isTourActive) return;
  const target = document.querySelector(`[data-tour="${attrName}"]`);
  if (target) {
    target.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-bg-primary');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

watch(
  () => [onboardingStore.isTourActive, onboardingStore.tourStep] as const,
  ([active]) => {
    if (active) {
      nextTick(() => highlightTargetElement(stepMeta.value.targetAttr));
    } else {
      highlightTargetElement(undefined);
    }
  },
  { immediate: true }
);

function onGlobalTourListeners(event: KeyboardEvent) {
  if (!onboardingStore.isTourActive) return;

  if (event.key === 'Escape') {
    onboardingStore.completeTour();
    return;
  }

  const step = onboardingStore.tourStep;
  const activeEl = document.activeElement as HTMLElement | null;
  const isDescFocused = activeEl?.getAttribute('data-tour') === 'timer-description';

  if (step === 1 && (matchesCommand(event, 'timer.new') || isDescFocused)) {
    setTimeout(() => {
      if (onboardingStore.tourStep === 1) onboardingStore.tourStep = 2;
    }, 120);
  } else if (step === 2 && isDescFocused && event.key.length === 1) {
    setTimeout(() => {
      if (onboardingStore.tourStep === 2) onboardingStore.tourStep = 3;
    }, 350);
  } else if (step === 3 && event.key === 'Tab') {
    setTimeout(() => {
      if (onboardingStore.tourStep === 3) onboardingStore.tourStep = 4;
    }, 150);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalTourListeners, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalTourListeners, true);
  highlightTargetElement(undefined);
});
</script>

<template>
  <div
    v-if="onboardingStore.isTourActive"
    class="relative overflow-hidden border-2 border-signal bg-bg-elevated p-5 shadow-2xl"
  >
    <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <Compass class="h-4 w-4 text-signal motion-safe:animate-pulse" />
        <span class="label-eyebrow font-semibold text-signal">
          {{ $t('onboarding.tour.badge') }}
        </span>
        <span class="tabular-telemetry border border-border-hairline bg-bg-primary px-2.5 py-0.5 text-xs font-medium text-text-muted">
          {{ t('onboarding.tour.stepCounter', { current: onboardingStore.tourStep, total: 6 }) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-press inline-flex h-8 items-center gap-1.5 border border-signal bg-signal-soft px-3 text-xs font-semibold uppercase text-signal hover:bg-accent hover:border-accent hover:text-white transition-colors"
          @click="onboardingStore.nextTourStep()"
        >
          <span>{{ $t('onboarding.tour.nextStep') }}</span>
          <ArrowRight class="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
          @click="onboardingStore.completeTour()"
        >
          <X class="h-3.5 w-3.5" />
          <span>{{ $t('onboarding.tour.skipTour') }}</span>
        </button>
      </div>
    </div>

    <div class="mt-3.5 flex flex-wrap items-center gap-3.5">
      <BrandKeycapBadge :keys="stepMeta.keycap" size="md" />
      <div>
        <div class="text-base font-semibold text-text-primary">
          <BrandWithKeys :text="stepMeta.title" />
        </div>
        <p class="mt-1 text-ui text-text-muted">
          <BrandWithKeys :text="stepMeta.body" />
        </p>
      </div>
    </div>
  </div>
</template>
