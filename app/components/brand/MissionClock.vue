<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    paused?: boolean;
  }>(),
  {
    paused: false,
  }
);

const elapsedMs = ref(0);
const prefersReducedMotion = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;
let startMs = 0;
let mql: MediaQueryList | null = null;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function stopTicker() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startTicker() {
  if (import.meta.server || props.paused || prefersReducedMotion.value) {
    stopTicker();
    return;
  }
  if (intervalId !== null) return;
  startMs = Date.now() - elapsedMs.value;
  intervalId = setInterval(() => {
    elapsedMs.value = Date.now() - startMs;
  }, 50);
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches;
  if (event.matches) {
    stopTicker();
  } else {
    startTicker();
  }
}

watch(
  () => props.paused,
  () => {
    if (props.paused) {
      stopTicker();
    } else {
      startTicker();
    }
  }
);

onMounted(() => {
  if (window.matchMedia) {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = mql.matches;
    mql.addEventListener('change', handleReducedMotionChange);
  }
  startTicker();
});

onBeforeUnmount(() => {
  stopTicker();
  mql?.removeEventListener('change', handleReducedMotionChange);
});

const totalSeconds = computed(() => Math.floor(elapsedMs.value / 1000));
const hours = computed(() => pad(Math.floor(totalSeconds.value / 3600)));
const minutes = computed(() => pad(Math.floor(totalSeconds.value / 60) % 60));
const seconds = computed(() => pad(totalSeconds.value % 60));
const centiseconds = computed(() => pad(Math.floor((elapsedMs.value % 1000) / 10)));
</script>

<template>
  <span class="tabular-telemetry inline-flex items-baseline">
    <span>T+ {{ hours }}:{{ minutes }}:{{ seconds }}.</span><span class="text-signal">{{ centiseconds }}</span>
  </span>
</template>
