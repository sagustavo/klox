<script setup lang="ts">
withDefaults(
  defineProps<{
    keys: string | string[];
    active?: boolean;
    size?: 'xs' | 'sm';
  }>(),
  {
    active: false,
    size: 'xs',
  }
);
</script>

<template>
  <kbd
    class="tabular-telemetry inline-flex items-center gap-0.5 border px-1.5 py-0.5 font-mono uppercase leading-none transition-colors select-none"
    :class="[
      size === 'xs' ? 'text-[11px]' : 'text-xs',
      active
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-border-hairline bg-bg-elevated text-text-muted',
    ]"
  >
    <template v-if="Array.isArray(keys)">
      <span v-for="(k, idx) in keys" :key="idx">
        {{ k }}<span v-if="idx < keys.length - 1" class="mx-0.5 opacity-50">+</span>
      </span>
    </template>
    <template v-else>{{ keys }}</template>
  </kbd>
</template>
