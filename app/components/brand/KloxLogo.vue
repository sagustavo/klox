<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    variant?: 'orbital' | 'reticle' | 'compact';
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
  <span class="inline-flex items-center select-none">
    <span
      v-if="variant === 'compact' || !showWordmark"
      class="display-wide inline-flex items-baseline font-semibold text-text-primary"
      :class="{
        'text-sm': size === 'sm',
        'text-base': size === 'md',
        'text-lg': size === 'lg',
      }"
    >
      <span>K</span>
      <span
        class="ml-[0.14em] inline-block shrink-0 bg-signal"
        :class="size === 'lg' ? 'h-2 w-2' : 'h-1.5 w-1.5'"
        aria-hidden="true"
      />
    </span>

    <span
      v-else
      class="display-wide inline-flex items-baseline font-semibold text-text-primary"
      :class="{
        'text-sm': size === 'sm',
        'text-base': size === 'md',
        'text-lg': size === 'lg',
      }"
    >
      <span
        :class="
          variant === 'orbital'
            ? 'tracking-[0.42em] -mr-[0.42em]'
            : 'tracking-[0.32em] -mr-[0.32em]'
        "
      >
        KLOX
      </span>
      <span
        class="inline-block shrink-0 bg-signal"
        :class="[
          variant === 'orbital' ? 'ml-[0.38em]' : 'ml-[0.28em]',
          size === 'lg' ? 'h-2 w-2' : 'h-1.5 w-1.5',
        ]"
        aria-hidden="true"
      />
    </span>
  </span>
</template>
