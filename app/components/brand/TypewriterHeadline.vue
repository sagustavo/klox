<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    lines: readonly string[];
    paused?: boolean;
    charDelayMs?: number;
  }>(),
  {
    paused: false,
    charDelayMs: 95,
  }
);

const totalChars = computed(() => props.lines.reduce((acc, line) => acc + line.length, 0));

// Start at 0 on both SSR and initial client hydration so the full headline never flashes before typing.
// Full text remains present in .sr-only for SEO/screen readers, and pure CSS shows the reservation
// layer immediately under prefers-reduced-motion: reduce.
const typedCount = ref(0);
const hasMounted = ref(false);
const prefersReducedMotion = ref(false);
const hasFinished = computed(() => typedCount.value >= totalChars.value);

let timerId: ReturnType<typeof setTimeout> | null = null;
let mql: MediaQueryList | null = null;

const isStatic = computed(() => props.paused || prefersReducedMotion.value);

function clearTimer() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function scheduleNextChar(initialBeat = false) {
  clearTimer();
  if (import.meta.server || isStatic.value) return;
  if (typedCount.value >= totalChars.value) return;

  // Pause slightly longer at line boundaries for natural orbital cadence
  let charsSeen = 0;
  let atLineBoundary = false;
  for (let i = 0; i < props.lines.length - 1; i++) {
    charsSeen += props.lines[i]!.length;
    if (typedCount.value === charsSeen) {
      atLineBoundary = true;
      break;
    }
  }

  const delay = initialBeat
    ? 180
    : atLineBoundary
      ? props.charDelayMs + 280
      : props.charDelayMs;

  timerId = setTimeout(() => {
    if (isStatic.value) return;
    typedCount.value += 1;
    scheduleNextChar(false);
  }, delay);
}

function restartTyping() {
  clearTimer();
  typedCount.value = 0;
  if (!isStatic.value && hasMounted.value) {
    scheduleNextChar(true);
  }
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches;
}

watch(
  () => props.lines.join('\n'),
  () => {
    restartTyping();
  }
);

watch(isStatic, (staticMode) => {
  if (staticMode) {
    clearTimer();
  } else if (hasMounted.value && typedCount.value < totalChars.value) {
    scheduleNextChar(typedCount.value === 0);
  }
});

onMounted(() => {
  hasMounted.value = true;
  if (window.matchMedia) {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = mql.matches;
    mql.addEventListener('change', handleReducedMotionChange);
  }
  if (!isStatic.value && typedCount.value < totalChars.value) {
    scheduleNextChar(true);
  }
});

onBeforeUnmount(() => {
  clearTimer();
  mql?.removeEventListener('change', handleReducedMotionChange);
});

const renderedLines = computed(() => {
  let remaining = typedCount.value;
  return props.lines.map((line) => {
    if (remaining <= 0) return '';
    const slice = line.slice(0, remaining);
    remaining -= slice.length;
    return slice;
  });
});

const activeLineIndex = computed(() => {
  let remaining = typedCount.value;
  for (let i = 0; i < props.lines.length; i++) {
    const len = props.lines[i]!.length;
    if (remaining <= len) return i;
    remaining -= len;
  }
  return Math.max(0, props.lines.length - 1);
});
</script>

<template>
  <h1 class="display-wide relative max-w-5xl text-4xl text-text-primary sm:text-6xl lg:text-7xl">
    <span class="sr-only">{{ lines.join(' ') }}</span>

    <!-- Zero-CLS layout reservation layer (also acts as instant static text when paused or reduced-motion) -->
    <span
      class="block select-none"
      :class="paused ? 'visible' : 'invisible motion-reduce:visible'"
      aria-hidden="true"
    >
      <template v-for="(line, idx) in lines" :key="`reserve-${idx}`">
        <span>{{ line }}</span>
        <br v-if="idx < lines.length - 1" />
      </template>
    </span>

    <!-- Visible kinetic typing overlay -->
    <span
      v-if="!paused"
      class="absolute inset-0 block motion-reduce:hidden"
      aria-hidden="true"
    >
      <template v-for="(slice, idx) in renderedLines" :key="`typed-${idx}`">
        <span>{{ slice }}</span>
        <span
          v-if="!isStatic && idx === activeLineIndex && (!hasFinished || idx === lines.length - 1)"
          class="animate-blink ml-[0.06em] inline-block h-[0.78em] w-[0.14em] bg-signal align-baseline"
        />
        <br v-if="idx < renderedLines.length - 1" />
      </template>
    </span>
  </h1>
</template>
