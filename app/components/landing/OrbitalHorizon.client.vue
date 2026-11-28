<script setup lang="ts">
import {
  ORBITAL_DESKTOP_MIN_WIDTH,
  probeOrbitalWebGLTier,
  type OrbitalWebGLTier,
} from '~/utils/webglGate';

const props = withDefaults(
  defineProps<{
    paused?: boolean;
    active?: boolean;
  }>(),
  {
    paused: false,
    active: true,
  }
);

const emit = defineEmits<{
  'active-takeover': [active: boolean];
}>();

const OrbitalScene = defineAsyncComponent(
  () => import('./OrbitalHorizonScene.client.vue')
);

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value !== 'light');

const tier = ref<OrbitalWebGLTier>('none');
const isReady = ref(false);
const hasContextLost = ref(false);
const isTabHidden = ref(false);

let hasProbed = false;
let idleHandle: number | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

function runTierProbe() {
  if (hasProbed || props.paused) return;
  hasProbed = true;
  tier.value = probeOrbitalWebGLTier();
}

function clearScheduledProbe() {
  if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleHandle);
    idleHandle = null;
  }
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function handleVisibilityChange() {
  isTabHidden.value = document.hidden;
}

const effectiveActive = computed(
  () => props.active && !isTabHidden.value && !hasContextLost.value
);

const takeoverActive = computed(() => isReady.value && !hasContextLost.value);

watch(takeoverActive, (next) => {
  emit('active-takeover', next);
});

watch(
  () => props.paused,
  (isPaused) => {
    // If page booted paused, probe lazily only if the user explicitly resumes motion.
    if (!isPaused && !hasProbed) {
      runTierProbe();
    }
  }
);

onMounted(() => {
  isTabHidden.value = document.hidden;
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (props.paused) return;

  const isDesktopViewport = (window.innerWidth || 0) >= ORBITAL_DESKTOP_MIN_WIDTH;
  const fallbackDelayMs = isDesktopViewport ? 1200 : 1500;

  if ('requestIdleCallback' in window) {
    idleHandle = window.requestIdleCallback(
      () => {
        clearScheduledProbe();
        runTierProbe();
      },
      { timeout: fallbackDelayMs }
    );
  } else {
    fallbackTimer = setTimeout(runTierProbe, fallbackDelayMs);
  }
});

onBeforeUnmount(() => {
  clearScheduledProbe();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  emit('active-takeover', false);
});
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000 ease-out"
    :class="takeoverActive ? 'opacity-100' : 'opacity-0'"
    aria-hidden="true"
  >
    <OrbitalScene
      v-if="tier !== 'none' && !hasContextLost"
      :quality="tier"
      :active="effectiveActive"
      :paused="paused"
      :is-dark="isDark"
      @ready="isReady = true"
      @context-lost="hasContextLost = true"
    />
  </div>
</template>
