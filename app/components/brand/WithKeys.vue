<script setup lang="ts">
const props = defineProps<{
  text: string;
}>();

function parseKeyToken(inner: string): string | string[] {
  if (inner === '+' || !inner.includes('+')) return inner;
  if (inner.endsWith('++')) {
    const prefix = inner.slice(0, -2).split('+').filter(Boolean);
    return [...prefix, '+'];
  }
  const parts = inner.split('+').filter(Boolean);
  return parts.length > 1 ? parts : (parts[0] ?? inner);
}

const segments = computed(() =>
  props.text.split(/(\[[^\]]+\])/g).map((part) => {
    const isKey = /^\[[^\]]+\]$/.test(part);
    return {
      isKey,
      value: isKey ? parseKeyToken(part.slice(1, -1)) : part,
    };
  })
);
</script>

<template>
  <span>
    <template v-for="(seg, idx) in segments" :key="idx">
      <BrandKeycapBadge
        v-if="seg.isKey"
        :keys="seg.value"
        size="sm"
        class="mx-0.5 align-baseline"
      />
      <template v-else>{{ seg.value }}</template>
    </template>
  </span>
</template>
