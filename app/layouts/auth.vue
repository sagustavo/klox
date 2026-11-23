<script setup lang="ts">
import { Globe } from 'lucide-vue-next';

const { locale, setLocale } = useI18n();
const localePath = useLocalePath();

function toggleLocale() {
  setLocale(locale.value === 'en' ? 'pt-br' : 'en');
}
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-bg-primary text-text-primary">
    <div
      class="grid-lines pointer-events-none absolute inset-0 opacity-45 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]"
      aria-hidden="true"
    />

    <header class="relative border-b border-border-hairline bg-bg-primary/70 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <NuxtLink
          :to="localePath('/')"
          :aria-label="$t('auth.backHome')"
          class="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <BrandKloxLogo variant="orbital" size="md" />
        </NuxtLink>

        <div class="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="tabular-telemetry btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium uppercase text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :aria-label="$t('nav.switchLanguage')"
            @click="toggleLocale"
          >
            <Globe class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ locale === 'pt-br' ? 'PT-BR' : 'EN' }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <slot />
    </main>
  </div>
</template>
