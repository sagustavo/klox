<script setup lang="ts">
definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const localePath = useLocalePath();

onMounted(async () => {
  await navigateTo(localePath('/app/projects'), { replace: true });
});
</script>

<template>
  <div class="p-8 text-center text-sm text-text-muted">
    {{ $t('projects.redirecting') }}
  </div>
</template>
