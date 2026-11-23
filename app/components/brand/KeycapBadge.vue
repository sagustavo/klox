<script setup lang="ts">
withDefaults(
  defineProps<{
    keys: string | string[];
    active?: boolean;
    animated?: boolean;
    animationDelay?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    active: false,
    animated: false,
    animationDelay: undefined,
    size: 'sm',
  }
);
</script>

<template>
  <kbd
    class="keycap tabular-telemetry inline-flex items-center justify-center gap-0.5 uppercase transition-colors select-none"
    :class="[
      size === 'sm' && 'text-xs px-1.5 py-0.5',
      size === 'md' && 'text-ui px-2 py-0.5',
      size === 'lg' && 'h-12 min-w-12 px-3 text-base',
      active && '!border-signal !bg-signal-soft !text-signal',
      animated && 'animate-press',
    ]"
    :style="animated && animationDelay ? { animationDelay } : undefined"
  >
    <template v-if="Array.isArray(keys)">
      <span v-for="(k, idx) in keys" :key="idx">
        {{ k }}<span v-if="idx < keys.length - 1" class="mx-0.5 opacity-55">+</span>
      </span>
    </template>
    <template v-else>{{ keys }}</template>
  </kbd>
</template>
