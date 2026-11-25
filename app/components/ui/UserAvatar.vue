<script setup lang="ts">
import { getUserInitials } from '~/domain/profile';

const props = withDefaults(
  defineProps<{
    src?: string | null;
    name?: string | null;
    email?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }>(),
  {
    src: null,
    name: null,
    email: null,
    size: 'md',
  }
);

const imgFailed = ref(false);

watch(
  () => props.src,
  () => {
    imgFailed.value = false;
  }
);

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-8 w-8 text-xs';
    case 'lg':
      return 'h-16 w-16 text-lg';
    case 'xl':
      return 'h-24 w-24 text-2xl';
    default:
      return 'h-10 w-10 text-sm';
  }
});

const initials = computed(() => getUserInitials(props.name, props.email));
const altText = computed(() => props.name?.trim() || props.email?.trim() || 'User');
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-hairline bg-bg-primary select-none"
    :class="sizeClass"
  >
    <img
      v-if="src && !imgFailed"
      :src="src"
      :alt="altText"
      referrerpolicy="no-referrer"
      decoding="async"
      class="h-full w-full object-cover"
      @error="imgFailed = true"
    />
    <span
      v-else
      class="display-wide tabular-telemetry font-semibold text-signal"
      aria-hidden="true"
    >
      {{ initials }}
    </span>
  </span>
</template>
