<script setup lang="ts">
const props = defineProps<{
  text: string;
}>();

const segments = computed(() =>
  props.text.split(/(\[[^\]]+\])/g).map((part) => {
    const isKey = /^\[[^\]]+\]$/.test(part);
    return {
      isKey,
      value: isKey ? part.slice(1, -1) : part,
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
