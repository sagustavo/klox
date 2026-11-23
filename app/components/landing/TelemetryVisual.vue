<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    paused?: boolean;
  }>(),
  {
    paused: false,
  }
);

type ProjectKey = 'engineering' | 'review' | 'planning' | 'admin';

interface DemoProject {
  key: ProjectKey;
  color: string;
  labelKey: string;
  dailyHours: readonly [number, number, number, number, number, number, number];
}

const projects: readonly DemoProject[] = [
  {
    key: 'engineering',
    color: 'var(--chart-1)',
    labelKey: 'landing.visuals.telemetry.seg1',
    dailyHours: [3.5, 4.0, 2.5, 4.5, 3.0, 0.5, 0.5], // 18.5h
  },
  {
    key: 'review',
    color: 'var(--chart-2)',
    labelKey: 'landing.visuals.telemetry.seg2',
    dailyHours: [1.5, 1.5, 2.5, 1.5, 2.0, 1.0, 0.5], // 10.5h
  },
  {
    key: 'planning',
    color: 'var(--chart-3)',
    labelKey: 'landing.visuals.telemetry.seg3',
    dailyHours: [1.0, 1.5, 1.0, 1.0, 2.0, 0.5, 0.5], // 7.5h
  },
  {
    key: 'admin',
    color: 'var(--chart-4)',
    labelKey: 'landing.visuals.telemetry.seg4',
    dailyHours: [0.5, 0.5, 1.0, 0.5, 1.0, 0.5, 0.5], // 4.5h
  },
];

// Choreographed infinite loop: All 4 -> Exclude Engineering -> Exclude Review -> Restore Engineering -> All 4
const choreographedStates: readonly (readonly ProjectKey[])[] = [
  ['engineering', 'review', 'planning', 'admin'],
  ['review', 'planning', 'admin'],
  ['planning', 'admin'],
  ['engineering', 'planning', 'admin'],
];

const activeStep = ref(0);
const activeProjects = ref<Set<ProjectKey>>(new Set(choreographedStates[0]));
const isHovered = ref(false);
const manualOverride = ref(false);
const prefersReducedMotion = ref(false);

let loopInterval: ReturnType<typeof setInterval> | null = null;
let overrideTimeout: ReturnType<typeof setTimeout> | null = null;
let mql: MediaQueryList | null = null;

function stopLoop() {
  if (loopInterval !== null) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

function clearOverrideTimer() {
  if (overrideTimeout !== null) {
    clearTimeout(overrideTimeout);
    overrideTimeout = null;
  }
}

function startLoop() {
  stopLoop();
  if (
    import.meta.server ||
    props.paused ||
    prefersReducedMotion.value ||
    isHovered.value ||
    manualOverride.value
  ) {
    return;
  }
  loopInterval = setInterval(() => {
    activeStep.value = (activeStep.value + 1) % choreographedStates.length;
    activeProjects.value = new Set(choreographedStates[activeStep.value]);
  }, 2600);
}

function toggleProject(key: ProjectKey) {
  manualOverride.value = true;
  const next = new Set(activeProjects.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  activeProjects.value = next;

  clearOverrideTimer();
  overrideTimeout = setTimeout(() => {
    manualOverride.value = false;
    startLoop();
  }, 8000);
}

function resumeAutoLoop() {
  clearOverrideTimer();
  manualOverride.value = false;
  activeStep.value = 0;
  activeProjects.value = new Set(choreographedStates[0]);
  startLoop();
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches;
}

watch(
  [() => props.paused, prefersReducedMotion, isHovered, manualOverride],
  ([paused, reduced, hovered, manual]) => {
    if (paused || reduced) {
      stopLoop();
      clearOverrideTimer();
      if (!manual) {
        activeStep.value = 0;
        activeProjects.value = new Set(choreographedStates[0]);
      }
      return;
    }
    if (hovered || manual) {
      stopLoop();
      return;
    }
    startLoop();
  }
);

onMounted(() => {
  if (window.matchMedia) {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = mql.matches;
    mql.addEventListener('change', handleReducedMotionChange);
  }
  startLoop();
});

onBeforeUnmount(() => {
  stopLoop();
  clearOverrideTimer();
  mql?.removeEventListener('change', handleReducedMotionChange);
});

const radius = 52;
const circumference = 2 * Math.PI * radius;

const projectTotals = computed(() =>
  projects.map((proj) => {
    const active = activeProjects.value.has(proj.key);
    const hours = active ? proj.dailyHours.reduce((sum, h) => sum + h, 0) : 0;
    return {
      ...proj,
      active,
      hours,
    };
  })
);

const totalHours = computed(() =>
  projectTotals.value.reduce((sum, item) => sum + item.hours, 0)
);

const arcs = computed(() => {
  const total = totalHours.value;
  let offset = 0;

  return projectTotals.value.map((item) => {
    if (!item.active || total <= 0 || item.hours <= 0) {
      return {
        ...item,
        percentage: 0,
        dashArray: `0 ${circumference}`,
        dashOffset: -offset,
      };
    }

    const ratio = item.hours / total;
    const length = ratio * circumference;
    const gap = Math.min(2, length * 0.25);
    const visibleLength = Math.max(0, length - gap);
    const arc = {
      ...item,
      percentage: Math.round(ratio * 100),
      dashArray: `${visibleLength.toFixed(2)} ${(circumference - visibleLength).toFixed(2)}`,
      dashOffset: -offset,
    };
    offset += length;
    return arc;
  });
});

const days = computed(() =>
  [0, 1, 2, 3, 4, 5, 6].map((dayIdx) =>
    projects.map((proj) => {
      const active = activeProjects.value.has(proj.key);
      const hours = active ? (proj.dailyHours[dayIdx] ?? 0) : 0;
      return {
        key: proj.key,
        color: proj.color,
        active,
        hours,
      };
    })
  )
);

const maxDayTotal = 7.5;
</script>

<template>
  <div
    class="border border-border-hairline bg-bg-elevated p-5 space-y-5"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Interactive Project Filter Chips & Total Readout -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3.5">
      <div
        class="flex flex-wrap items-center gap-1.5"
        role="group"
        :aria-label="$t('landing.visuals.telemetry.filterAria')"
      >
        <button
          v-for="proj in projectTotals"
          :key="proj.key"
          type="button"
          :aria-pressed="proj.active"
          class="btn-press inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          :class="
            proj.active
              ? 'border-signal/45 bg-signal-soft text-text-primary'
              : 'border-border-hairline bg-bg-primary text-text-faint opacity-55 hover:opacity-90'
          "
          @click="toggleProject(proj.key)"
        >
          <span
            class="h-2 w-2 shrink-0 transition-opacity"
            :class="proj.active ? 'opacity-100' : 'opacity-40'"
            :style="{ backgroundColor: proj.color }"
          />
          <span :class="!proj.active && 'line-through'">{{ $t(proj.labelKey) }}</span>
        </button>

        <button
          v-if="manualOverride"
          type="button"
          class="btn-press inline-flex items-center border border-border-hairline bg-bg-primary px-2 py-1 text-xs font-medium text-signal hover:border-signal transition-colors"
          @click="resumeAutoLoop"
        >
          {{ $t('landing.visuals.telemetry.autoResume') }}
        </button>
      </div>

      <div class="tabular-telemetry flex items-baseline gap-1.5 text-xs text-text-muted">
        <span class="label-eyebrow">{{ $t('landing.visuals.telemetry.totalLabel') }}</span>
        <span class="text-sm font-semibold text-text-primary">
          {{ totalHours.toFixed(1) }}h
        </span>
      </div>
    </div>

    <!-- Donut + Legend & Stacked Bar Showcase -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 items-center">
      <div class="flex items-center gap-5">
        <div class="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 140 140" class="h-32 w-32 -rotate-90" aria-hidden="true">
            <circle
              cx="70"
              cy="70"
              :r="radius"
              fill="none"
              stroke="var(--border-hairline)"
              stroke-width="14"
            />
            <circle
              v-for="arc in arcs"
              :key="arc.key"
              cx="70"
              cy="70"
              :r="radius"
              fill="none"
              :stroke="arc.color"
              stroke-width="14"
              :stroke-dasharray="arc.dashArray"
              :stroke-dashoffset="arc.dashOffset"
              :style="{ opacity: arc.active ? 1 : 0 }"
              class="motion-safe:transition-[stroke-dasharray,stroke-dashoffset,opacity] motion-safe:duration-700 motion-safe:ease-out"
            />
          </svg>
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="display-wide tabular-telemetry text-sm text-text-primary">
              {{ totalHours.toFixed(1) }}h
            </span>
          </div>
        </div>

        <ul class="flex-1 space-y-2 text-xs">
          <li
            v-for="arc in arcs"
            :key="arc.key"
            class="flex items-center gap-2 transition-opacity motion-safe:duration-300"
            :class="arc.active ? 'opacity-100' : 'opacity-35'"
          >
            <span class="h-2.5 w-2.5 shrink-0" :style="{ backgroundColor: arc.color }" />
            <span class="text-text-muted truncate">{{ $t(arc.labelKey) }}</span>
            <span class="tabular-telemetry ml-auto text-text-primary font-medium">
              {{ arc.percentage }}%
            </span>
          </li>
        </ul>
      </div>

      <div class="flex flex-col gap-2" aria-hidden="true">
        <div class="flex h-28 items-end gap-2">
          <div
            v-for="(daySegments, dayIdx) in days"
            :key="dayIdx"
            class="flex flex-1 flex-col-reverse gap-px h-full justify-start"
            style="contain: layout style;"
          >
            <div
              v-for="seg in daySegments"
              :key="seg.key"
              class="w-full motion-safe:transition-[height,opacity] motion-safe:duration-500 motion-safe:ease-out"
              :style="{
                height: `${(seg.hours / maxDayTotal) * 100}%`,
                opacity: seg.active && seg.hours > 0 ? 1 : 0,
                backgroundColor: seg.color,
              }"
            />
          </div>
        </div>

        <div class="grid grid-cols-7 gap-2 text-center text-xs text-text-faint tabular-telemetry">
          <span v-for="dayIdx in 7" :key="dayIdx">
            {{ $t(`landing.visuals.telemetry.days.${dayIdx - 1}`) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
