<script setup lang="ts">
const { locale } = useI18n();

const htmlLang = computed(() => (locale.value === 'pt-br' ? 'pt-BR' : 'en-US'));

useHead({
  htmlAttrs: {
    lang: htmlLang,
  },
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
