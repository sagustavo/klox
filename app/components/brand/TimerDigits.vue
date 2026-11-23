<script setup lang="ts">
import { formatHMS } from '~/domain/duration';

const props = withDefaults(
  defineProps<{
    seconds: number;
    running?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    running: false,
    size: 'md',
  }
);

const formatted = computed(() => formatHMS(props.seconds));
</script>

<template>
  <span
    class="tabular-telemetry inline-flex items-center gap-1.5 font-semibold tracking-tight select-none"
    :class="[
      size === 'sm' && 'text-sm',
      size === 'md' && 'text-base sm:text-lg',
      size === 'lg' && 'text-2xl sm:text-3xl',
      running ? 'text-text-primary' : 'text-text-muted',
    ]"
  >
    <span
      v-if="running"
      class="inline-block h-1.5 w-1.5 shrink-0 bg-signal motion-safe:animate-pulse"
      aria-hidden="true"
    />
    <span>{{ formatted }}</span>
  </span>
</template>
