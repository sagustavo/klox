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
    class="border border-border-hairline bg-bg-elevated p-4 space-y-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-3">
        <span class="text-xs font-mono uppercase tracking-wider text-text-muted">
          {{ $t('onboarding.checklist.title') }}
        </span>
        <span class="tabular-telemetry border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
          {{ onboardingStore.completedCount }} / {{ onboardingStore.totalChecklistCount }} ({{ progressPercent }}%)
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 border border-accent/50 bg-accent/10 px-2.5 text-[11px] font-mono uppercase tracking-wider text-accent hover:bg-accent hover:text-white transition-colors"
          @click="handleLaunchTour"
        >
          <Compass class="h-3.5 w-3.5" />
          <span>{{ $t('onboarding.checklist.startTourButton') }}</span>
        </button>

        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2 text-[11px] font-mono text-text-muted hover:text-text-primary"
          @click="onboardingStore.dismissChecklist()"
        >
          <X class="h-3 w-3" />
          <span>{{ $t('onboarding.checklist.dismiss') }}</span>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="h-1 w-full bg-bg-primary overflow-hidden">
      <div
        class="h-full bg-accent transition-all duration-300"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <!-- Checklist items grid -->
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
      <div
        v-for="itemId in ALL_CHECKLIST_ITEMS"
        :key="itemId"
        class="flex items-start gap-2 border border-border-hairline bg-bg-primary px-3 py-2 text-xs transition-colors"
        :class="
          onboardingStore.state.checklist[itemId]
            ? 'border-emerald-500/30 bg-emerald-500/5 text-text-muted line-through'
            : 'text-text-primary'
        "
      >
        <CheckCircle2
          v-if="onboardingStore.state.checklist[itemId]"
          class="h-3.5 w-3.5 shrink-0 text-emerald-400 mt-0.5"
        />
        <Circle
          v-else
          class="h-3.5 w-3.5 shrink-0 text-text-muted mt-0.5"
        />
        <span>{{ $t(`onboarding.checklist.items.${itemId}`) }}</span>
      </div>
    </div>
  </div>
</template>
