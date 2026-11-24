<script setup lang="ts">
import { Globe, ArrowRight } from 'lucide-vue-next';

const { locale, setLocale } = useI18n();
const localePath = useLocalePath();

const hasActiveSession = ref(false);

onMounted(() => {
  hasActiveSession.value =
    localStorage.getItem('klox_demo_session') === '1' ||
    localStorage.getItem('klox_auth_session') === '1';
});

function toggleLocale() {
  setLocale(locale.value === 'en' ? 'pt-br' : 'en');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg-primary text-text-primary">
    <header class="fixed inset-x-0 top-0 z-50 border-b border-border-hairline bg-bg-primary/75 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <NuxtLink
          :to="localePath('/')"
          class="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <BrandKloxLogo variant="orbital" size="md" />
        </NuxtLink>

        <nav
          aria-label="Primary"
          class="hidden items-center gap-10 md:flex"
        >
          <a
            href="#features"
            class="label-eyebrow text-text-muted transition-colors hover:text-text-primary"
          >
            {{ $t('nav.features') }}
          </a>
          <a
            href="#pricing"
            class="label-eyebrow text-text-muted transition-colors hover:text-text-primary"
          >
            {{ $t('nav.pricing') }}
          </a>
          <a
            href="#faq"
            class="label-eyebrow text-text-muted transition-colors hover:text-text-primary"
          >
            {{ $t('nav.faq') }}
          </a>
        </nav>

        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            class="tabular-telemetry btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium uppercase text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :aria-label="$t('nav.switchLanguage')"
            @click="toggleLocale"
          >
            <Globe class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ locale === 'pt-br' ? 'PT-BR' : 'EN' }}</span>
          </button>

          <ClientOnly>
            <template v-if="hasActiveSession">
              <NuxtLink :to="localePath('/app')" class="btn-orbit h-9 px-4">
                <span>{{ $t('nav.openApp') }}</span>
                <ArrowRight class="h-3.5 w-3.5" />
              </NuxtLink>
            </template>
            <template v-else>
              <NuxtLink
                :to="localePath('/login')"
                class="hidden sm:inline-flex h-9 items-center px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              >
                {{ $t('nav.signIn') }}
              </NuxtLink>
              <NuxtLink :to="localePath('/login?mode=signup')" class="btn-launch h-9 px-4">
                {{ $t('nav.getStarted') }}
              </NuxtLink>
            </template>
            <template #fallback>
              <NuxtLink
                :to="localePath('/login')"
                class="hidden sm:inline-flex h-9 items-center px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              >
                {{ $t('nav.signIn') }}
              </NuxtLink>
              <NuxtLink :to="localePath('/login?mode=signup')" class="btn-launch h-9 px-4">
                {{ $t('nav.getStarted') }}
              </NuxtLink>
            </template>
          </ClientOnly>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-border-hairline bg-bg-primary">
      <div class="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-24">
        <h2 class="display-wide mx-auto max-w-3xl text-3xl text-text-primary sm:text-5xl">
          {{ $t('landing.closing.title') }}
        </h2>
        <div class="mt-10 flex justify-center">
          <NuxtLink :to="localePath('/login?mode=signup')" class="btn-launch h-12 px-8">
            <span>{{ $t('landing.closing.cta') }}</span>
            <ArrowRight class="h-4 w-4" />
          </NuxtLink>
        </div>
      </div>

      <div class="border-t border-border-hairline">
        <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-ui text-text-muted sm:px-6 md:flex-row">
          <div class="flex flex-wrap items-center justify-center gap-3">
            <BrandKloxLogo variant="orbital" size="sm" />
            <span>{{ $t('landing.footer.copyright') }}</span>
          </div>

          <div class="flex items-center gap-2 text-xs">
            <span class="text-text-faint">{{ $t('landing.footer.supportPrompt') }}</span>
            <a
              href="mailto:contact@klox.dev"
              class="text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              contact@klox.dev
            </a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
