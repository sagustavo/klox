<script setup lang="ts">
const segments = [
  { value: 42, color: 'var(--chart-1)', labelKey: 'landing.visuals.telemetry.seg1' },
  { value: 26, color: 'var(--chart-2)', labelKey: 'landing.visuals.telemetry.seg2' },
  { value: 20, color: 'var(--chart-3)', labelKey: 'landing.visuals.telemetry.seg3' },
  { value: 12, color: 'var(--chart-4)', labelKey: 'landing.visuals.telemetry.seg4' },
] as const;

const radius = 52;
const circumference = 2 * Math.PI * radius;

const arcs = computed(() => {
  let offset = 0;
  return segments.map((seg) => {
    const length = (seg.value / 100) * circumference;
    const item = {
      ...seg,
      dashArray: `${length - 2} ${circumference - length + 2}`,
      dashOffset: -offset,
    };
    offset += length;
    return item;
  });
});

const days = [
  [3, 2, 1, 1],
  [4, 1, 2, 0.5],
  [2, 3, 1, 1],
  [5, 1, 1, 0.5],
  [3, 2, 2, 1],
  [1, 1, 0.5, 0.5],
  [0.5, 0.5, 0, 0],
];
</script>

<template>
  <div class="grid grid-cols-1 gap-6 border border-border-hairline bg-bg-elevated p-5 sm:grid-cols-2">
    <div class="flex items-center gap-5">
      <svg viewBox="0 0 140 140" class="h-32 w-32 shrink-0 -rotate-90" aria-hidden="true">
        <circle
          v-for="arc in arcs"
          :key="arc.labelKey"
          cx="70"
          cy="70"
          :r="radius"
          fill="none"
          :stroke="arc.color"
          stroke-width="14"
          :stroke-dasharray="arc.dashArray"
          :stroke-dashoffset="arc.dashOffset"
        />
      </svg>

      <ul class="flex-1 space-y-2 font-mono text-xs">
        <li
          v-for="seg in segments"
          :key="seg.labelKey"
          class="flex items-center gap-2"
        >
          <span class="h-2.5 w-2.5 shrink-0" :style="{ backgroundColor: seg.color }" />
          <span class="text-text-muted truncate">{{ $t(seg.labelKey) }}</span>
          <span class="tabular-telemetry ml-auto text-text-primary font-medium">{{ seg.value }}%</span>
        </li>
      </ul>
    </div>

    <div class="flex h-32 items-end gap-2" aria-hidden="true">
      <div
        v-for="(day, dayIdx) in days"
        :key="dayIdx"
        class="flex flex-1 flex-col-reverse gap-px"
      >
        <div
          v-for="(hours, segIdx) in day"
          :key="segIdx"
          :style="{
            height: `${hours * 10}px`,
            backgroundColor: segments[segIdx]?.color,
          }"
        />
      </div>
    </div>
  </div>
</template>
