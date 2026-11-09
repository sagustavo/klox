<script setup lang="ts">
definePageMeta({
  layout: 'marketing',
});

const localePath = useLocalePath();
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-16">
    <div class="border border-border-hairline bg-bg-elevated p-6">
      <div class="mb-4 flex items-center justify-between">
        <BrandKloxLogo size="sm" />
        <span class="text-[11px] font-mono uppercase text-accent">AUTH · PHASE 2</span>
      </div>
      <h1 class="text-lg font-semibold text-text-primary">
        {{ $t('nav.signIn') }}
      </h1>
      <p class="mt-2 text-xs text-text-muted">
        {{ $t('app.placeholderSubtitle') }}
      </p>
      <div class="mt-6">
        <NuxtLink
          :to="localePath('/app?demo=1')"
          class="inline-flex h-9 w-full items-center justify-center bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
        >
          {{ $t('landing.ctaDemo') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
