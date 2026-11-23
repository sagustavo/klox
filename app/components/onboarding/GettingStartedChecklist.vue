<script setup lang="ts">
import { CheckCircle2, Circle, Compass, X } from 'lucide-vue-next';
import { ALL_CHECKLIST_ITEMS } from '~/domain/onboarding';
import { useOnboardingStore } from '~/stores/onboarding';

const onboardingStore = useOnboardingStore();
const localePath = useLocalePath();

const progressPercent = computed(() => {
  if (onboardingStore.totalChecklistCount === 0) return 0;
  return Math.round(
    (onboardingStore.completedCount / onboardingStore.totalChecklistCount) * 100
  );
});

async function handleLaunchTour() {
  onboardingStore.startTour();
  await navigateTo(localePath('/app'));
}
</script>

<template>
  <div
    v-if="!onboardingStore.isChecklistDismissed"
    class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 space-y-3.5"
  >
    <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-3">
        <span class="label-mono text-text-muted">
          {{ $t('onboarding.checklist.title') }}
        </span>
        <span class="tabular-telemetry border border-signal/40 bg-signal-soft px-2.5 py-0.5 font-mono text-xs font-semibold text-signal">
          {{ onboardingStore.completedCount }} / {{ onboardingStore.totalChecklistCount }} ({{ progressPercent }}%)
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 border border-signal/50 bg-signal-soft px-3 text-xs font-mono uppercase tracking-wider text-signal hover:bg-accent hover:border-accent hover:text-white transition-colors"
          @click="handleLaunchTour"
        >
          <Compass class="h-3.5 w-3.5" />
          <span>{{ $t('onboarding.checklist.startTourButton') }}</span>
        </button>

        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-mono text-text-muted hover:text-text-primary transition-colors"
          @click="onboardingStore.dismissChecklist()"
        >
          <X class="h-3.5 w-3.5" />
          <span>{{ $t('onboarding.checklist.dismiss') }}</span>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="h-1 w-full bg-bg-primary overflow-hidden">
      <div
        class="h-full bg-signal transition-all duration-300"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <!-- Checklist items grid -->
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
      <div
        v-for="itemId in ALL_CHECKLIST_ITEMS"
        :key="itemId"
        class="flex items-start gap-2.5 border border-border-hairline bg-bg-primary px-3.5 py-2.5 text-ui transition-colors"
        :class="
          onboardingStore.state.checklist[itemId]
            ? 'border-emerald-500/30 bg-emerald-500/5 text-text-muted line-through'
            : 'text-text-primary'
        "
      >
        <CheckCircle2
          v-if="onboardingStore.state.checklist[itemId]"
          class="h-4 w-4 shrink-0 text-emerald-500 mt-0.5"
        />
        <Circle
          v-else
          class="h-4 w-4 shrink-0 text-text-muted mt-0.5"
        />
        <BrandWithKeys :text="$t(`onboarding.checklist.items.${itemId}`)" />
      </div>
    </div>
  </div>
</template>
