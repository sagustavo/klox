<script setup lang="ts">
withDefaults(
  defineProps<{
    signalLine?: boolean;
    glow?: boolean;
    gridBackdrop?: boolean;
    padded?: boolean;
    as?: string;
  }>(),
  {
    signalLine: false,
    glow: false,
    gridBackdrop: false,
    padded: true,
    as: 'div',
  }
);
</script>

<template>
  <component
    :is="as"
    class="relative overflow-hidden border border-border-hairline bg-bg-elevated"
    :class="[glow && 'glow-signal', padded && 'p-5 sm:p-6']"
  >
    <div
      v-if="gridBackdrop"
      class="grid-lines pointer-events-none absolute inset-0 opacity-35 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      aria-hidden="true"
    />
    <div
      v-if="signalLine"
      class="signal-line absolute inset-x-0 top-0"
      aria-hidden="true"
    />
    <div v-if="$slots.header" class="relative mb-4 border-b border-border-hairline pb-3">
      <slot name="header" />
    </div>
    <div class="relative">
      <slot />
    </div>
  </component>
</template>
