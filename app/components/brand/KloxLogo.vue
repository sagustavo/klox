<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    showWordmark?: boolean;
  }>(),
  {
    size: 'md',
    showWordmark: true,
  }
);
</script>

<template>
  <span class="inline-flex items-center gap-2.5 select-none">
    <span
      class="relative inline-flex items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary"
      :class="{
        'h-6 w-6': size === 'sm',
        'h-7 w-7': size === 'md',
        'h-9 w-9': size === 'lg',
      }"
      aria-hidden="true"
    >
      <!-- Sharp telemetry reticle mark -->
      <svg
        viewBox="0 0 24 24"
        fill="none"
        class="h-4 w-4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="square"
      >
        <path d="M5 4v16" />
        <path d="M18 5L8 12l10 7" class="text-accent" />
      </svg>
      <span class="absolute top-0.5 right-0.5 h-1 w-1 bg-accent" />
    </span>
    <span
      v-if="showWordmark"
      class="font-mono font-semibold tracking-widest uppercase text-text-primary"
      :class="{
        'text-xs': size === 'sm',
        'text-sm': size === 'md',
        'text-base': size === 'lg',
      }"
    >
      KLOX
    </span>
  </span>
</template>
