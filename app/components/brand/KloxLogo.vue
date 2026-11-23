<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    variant?: 'orbital' | 'reticle';
    showWordmark?: boolean;
  }>(),
  {
    size: 'md',
    variant: 'orbital',
    showWordmark: true,
  }
);
</script>

<template>
  <span class="inline-flex items-center gap-2.5 select-none">
    <span
      v-if="variant === 'reticle'"
      class="relative inline-flex items-center justify-center border border-border-hairline bg-bg-elevated text-text-primary"
      :class="{
        'h-6 w-6': size === 'sm',
        'h-7 w-7': size === 'md',
        'h-9 w-9': size === 'lg',
      }"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        class="h-4 w-4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="square"
      >
        <path d="M5 4v16" />
        <path d="M18 5L8 12l10 7" class="text-signal" />
      </svg>
      <span class="absolute top-0.5 right-0.5 h-1 w-1 bg-signal" />
    </span>

    <span
      v-if="showWordmark"
      class="display-wide inline-flex items-center gap-1.5 font-semibold text-text-primary"
      :class="[
        variant === 'orbital' ? 'tracking-[0.35em]' : 'tracking-[0.22em]',
        {
          'text-sm': size === 'sm',
          'text-base': size === 'md',
          'text-lg': size === 'lg',
        },
      ]"
    >
      <span>KLOX</span>
      <span
        v-if="variant === 'orbital'"
        class="inline-block h-1.5 w-1.5 bg-signal"
        aria-hidden="true"
      />
    </span>
  </span>
</template>
