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
    <header class="sticky top-0 z-30 border-b border-border-hairline bg-bg-primary/90 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <NuxtLink :to="localePath('/')" class="flex items-center gap-2">
          <BrandKloxLogo size="md" />
        </NuxtLink>

        <div class="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="tabular-telemetry inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-2.5 text-xs font-mono uppercase text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            :aria-label="$t('nav.switchLanguage')"
            @click="toggleLocale"
          >
            <Globe class="h-3.5 w-3.5" />
            <span>{{ locale === 'pt-br' ? 'PT-BR' : 'EN' }}</span>
          </button>

          <ClientOnly>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
              :aria-label="$t('nav.toggleTheme')"
              @click="toggleTheme"
            >
              <Sun v-if="colorMode.value === 'dark'" class="h-3.5 w-3.5" />
              <Moon v-else class="h-3.5 w-3.5" />
            </button>
            <template #fallback>
              <span class="inline-flex h-8 w-8 border border-border-hairline bg-bg-elevated" />
            </template>
          </ClientOnly>

          <NuxtLink
            :to="localePath('/login')"
            class="hidden sm:inline-flex h-8 items-center border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
          >
            {{ $t('nav.signIn') }}
          </NuxtLink>

          <NuxtLink
            :to="localePath('/login?mode=signup')"
            class="inline-flex h-8 items-center bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
          >
            {{ $t('nav.getStarted') }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-border-hairline py-6">
      <div class="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-text-muted font-mono">
        <div class="flex items-center gap-3">
          <BrandKloxLogo size="sm" />
          <span>— {{ $t('brand.tagline') }}</span>
        </div>
        <div class="tabular-telemetry">klox.dev · v0.1.0</div>
      </div>
    </footer>
  </div>
</template>
