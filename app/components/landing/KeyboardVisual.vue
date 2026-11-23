<script setup lang="ts">
withDefaults(
  defineProps<{
    paused?: boolean;
  }>(),
  {
    paused: false,
  }
);

const steps = [
  { key: 'N', labelKey: 'landing.visuals.keyboard.step1' },
  { key: 'Tab', labelKey: 'landing.visuals.keyboard.step2' },
  { key: 'Tab', labelKey: 'landing.visuals.keyboard.step3' },
  { key: 'Enter', labelKey: 'landing.visuals.keyboard.step4' },
  { key: 'S', labelKey: 'landing.visuals.keyboard.step5' },
] as const;
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <div
        v-for="(step, idx) in steps"
        :key="`${step.key}-${idx}`"
        class="flex items-center gap-3"
      >
        <div class="flex flex-col items-center gap-2">
          <BrandKeycapBadge
            :keys="step.key"
            size="lg"
            :animated="!paused"
            :animation-delay="`${idx * 0.5}s`"
          />
          <span class="label-eyebrow text-text-faint">{{ $t(step.labelKey) }}</span>
        </div>
        <span
          v-if="idx < steps.length - 1"
          class="mb-6 text-sm text-text-faint"
          aria-hidden="true"
        >
          →
        </span>
      </div>
    </div>

    <div class="border border-border-hairline bg-bg-elevated p-4 text-sm">
      <div class="flex flex-wrap items-center gap-1.5 text-text-primary">
        <span class="text-text-faint">{{ $t('landing.visuals.keyboard.promptLabel') }}</span>
        <span>{{ $t('landing.visuals.keyboard.sampleText') }}</span>
        <span class="animate-blink ml-0.5 text-signal" aria-hidden="true">▍</span>
      </div>
      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="bg-signal-soft px-2.5 py-1 text-signal">
          #{{ $t('landing.visuals.keyboard.tag1') }}
        </span>
        <span class="bg-bg-secondary px-2.5 py-1 text-text-muted">
          #{{ $t('landing.visuals.keyboard.tag2') }}
        </span>
      </div>
    </div>
  </div>
</template>
