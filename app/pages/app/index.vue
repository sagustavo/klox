<script setup lang="ts">
definePageMeta({
  layout: 'app',
});
</script>

<template>
  <div class="border border-border-hairline bg-bg-elevated p-6">
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border-hairline pb-4">
      <div>
        <h1 class="text-lg font-semibold text-text-primary">
          {{ $t('app.placeholderTitle') }}
        </h1>
        <p class="mt-1 text-xs text-text-muted">
          {{ $t('app.placeholderSubtitle') }}
        </p>
      </div>
      <BrandTimerDigits :seconds="0" size="lg" />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-muted font-mono">
      <BrandKeycapBadge keys="N" />
      <BrandKeycapBadge keys="Tab" />
      <BrandKeycapBadge :keys="['⌘', 'I']" />
      <BrandKeycapBadge keys="S" />
      <BrandKeycapBadge keys="Esc" />
    </div>
  </div>
</template>
