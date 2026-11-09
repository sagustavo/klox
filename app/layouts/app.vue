<script setup lang="ts">
import { Sun, Moon, Globe } from 'lucide-vue-next';

const colorMode = useColorMode();
const { locale, setLocale } = useI18n();
const localePath = useLocalePath();

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function toggleLocale() {
  setLocale(locale.value === 'en' ? 'pt-br' : 'en');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg-primary text-text-primary">
    <header class="sticky top-0 z-30 border-b border-border-hairline bg-bg-elevated">
      <div class="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <div class="flex items-center gap-6">
          <NuxtLink :to="localePath('/app')" class="flex items-center gap-2">
            <BrandKloxLogo size="sm" />
          </NuxtLink>
          <span
            class="tabular-telemetry border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent"
          >
            {{ $t('app.demoBanner') }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="tabular-telemetry inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2 text-[11px] font-mono uppercase text-text-muted hover:text-text-primary"
            @click="toggleLocale"
          >
            <Globe class="h-3 w-3" />
            <span>{{ locale === 'pt-br' ? 'PT-BR' : 'EN' }}</span>
          </button>

          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary"
            :aria-label="$t('nav.toggleTheme')"
            @click="toggleTheme"
          >
            <Sun v-if="colorMode.value === 'dark'" class="h-3.5 w-3.5" />
            <Moon v-else class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <slot />
    </main>
  </div>
</template>
