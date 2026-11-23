<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    paused?: boolean;
  }>(),
  {
    paused: false,
  }
);

const lines = [
  { keyPath: 'landing.visuals.csv.k1', valPath: 'landing.visuals.csv.v1' },
  { keyPath: 'landing.visuals.csv.k2', valPath: 'landing.visuals.csv.v2' },
  { keyPath: 'landing.visuals.csv.k3', valPath: 'landing.visuals.csv.v3' },
  { keyPath: 'landing.visuals.csv.k4', valPath: 'landing.visuals.csv.v4' },
  { keyPath: 'landing.visuals.csv.k5', valPath: 'landing.visuals.csv.v5' },
] as const;

const activeStep = ref(0);
const prefersReducedMotion = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;
let mql: MediaQueryList | null = null;

function stopPipeline() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startPipeline() {
  stopPipeline();
  if (import.meta.server || props.paused || prefersReducedMotion.value) return;
  intervalId = setInterval(() => {
    activeStep.value = (activeStep.value + 1) % lines.length;
  }, 1300);
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches;
}

watch([() => props.paused, prefersReducedMotion], ([paused, reduced]) => {
  if (paused || reduced) {
    stopPipeline();
  } else {
    startPipeline();
  }
});

onMounted(() => {
  if (window.matchMedia) {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = mql.matches;
    mql.addEventListener('change', handleReducedMotionChange);
  }
  startPipeline();
});

onBeforeUnmount(() => {
  stopPipeline();
  mql?.removeEventListener('change', handleReducedMotionChange);
});

const isStatic = computed(() => props.paused || prefersReducedMotion.value);
const progressScale = computed(() =>
  isStatic.value ? 1 : (activeStep.value + 1) / lines.length
);
</script>

<template>
  <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated text-sm">
    <div class="flex items-center justify-between gap-2.5 border-b border-border-hairline px-4 py-3">
      <div class="flex items-center gap-2.5">
        <span
          class="h-2 w-2 rounded-full bg-signal"
          :class="!isStatic && 'motion-safe:animate-pulse'"
          aria-hidden="true"
        />
        <span class="label-eyebrow text-text-muted">{{ $t('landing.visuals.csv.title') }}</span>
      </div>
      <span class="tabular-telemetry text-xs font-medium text-signal">
        {{ isStatic ? '5/5' : `${activeStep + 1}/${lines.length}` }}
      </span>
    </div>

    <!-- Compositor-only progress bar -->
    <div class="h-0.5 w-full bg-border-subtle overflow-hidden" aria-hidden="true">
      <div
        class="h-full w-full origin-left bg-signal motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
        :style="{ transform: `scaleX(${progressScale})` }"
      />
    </div>

    <div class="space-y-1.5 p-3">
      <div
        v-for="(line, idx) in lines"
        :key="line.keyPath"
        class="flex items-baseline gap-4 border-l-2 px-2.5 py-1.5 transition-colors motion-safe:duration-300"
        :class="
          isStatic
            ? 'border-l-signal/60 bg-transparent text-text-primary'
            : idx === activeStep
              ? 'border-l-signal bg-signal-soft text-text-primary'
              : idx < activeStep
                ? 'border-l-signal/40 text-text-muted'
                : 'border-l-transparent text-text-faint opacity-65'
        "
      >
        <span
          class="w-20 shrink-0 font-mono text-xs uppercase"
          :class="isStatic || idx <= activeStep ? 'text-signal' : 'text-text-faint'"
        >
          {{ $t(line.keyPath) }}
        </span>
        <span class="font-mono text-ui truncate">{{ $t(line.valPath) }}</span>
      </div>
    </div>
  </div>
</template>
