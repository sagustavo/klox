<script setup lang="ts">
import {
  Sun,
  Moon,
  Globe,
  Settings,
  LogOut,
  Clock,
  FolderKanban,
  BarChart3,
  FileSpreadsheet,
  HelpCircle,
} from 'lucide-vue-next';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useOnboardingStore } from '~/stores/onboarding';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimerStore } from '~/stores/timer';

const colorMode = useColorMode();
const { locale, setLocale } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const onboardingStore = useOnboardingStore();
const prefsStore = usePreferencesStore();
const timerStore = useTimerStore();

useDynamicTabTitle();

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
});

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

async function toggleLocale() {
  const next = locale.value === 'en' ? 'pt-br' : 'en';
  await setLocale(next);
  await prefsStore.updatePreferences(
    { locale: next },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function handleSignOut() {
  await authStore.signOutUser();
  await navigateTo(localePath('/login'));
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg-primary text-text-primary">
    <header class="sticky top-0 z-30 border-b border-border-hairline bg-bg-elevated/90 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div class="flex items-center gap-4 overflow-x-auto">
          <NuxtLink
            :to="localePath('/app')"
            class="flex items-center gap-2 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <BrandKloxLogo variant="reticle" size="sm" />
          </NuxtLink>

          <nav class="flex items-center gap-1 shrink-0" aria-label="Workspace">
            <NuxtLink
              :to="localePath('/app')"
              class="inline-flex h-9 items-center gap-2 px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              exact-active-class="!text-text-primary bg-bg-hover border border-border-hairline border-b-2 border-b-signal"
            >
              <Clock class="h-4 w-4 text-signal" />
              <span>{{ $t('nav.tracker') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/dashboard')"
              class="inline-flex h-9 items-center gap-2 px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline border-b-2 border-b-signal"
              data-tour="nav-dashboard"
            >
              <BarChart3 class="h-4 w-4" />
              <span>{{ $t('nav.dashboard') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/catalog')"
              class="inline-flex h-9 items-center gap-2 px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline border-b-2 border-b-signal"
              data-tour="nav-catalog"
            >
              <FolderKanban class="h-4 w-4" />
              <span>{{ $t('nav.catalog') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/import')"
              class="inline-flex h-9 items-center gap-2 px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline border-b-2 border-b-signal"
              data-tour="nav-import"
            >
              <FileSpreadsheet class="h-4 w-4" />
              <span>{{ $t('nav.import') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/settings')"
              class="inline-flex h-9 items-center gap-2 px-3 text-ui font-medium text-text-muted transition-colors hover:text-text-primary"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline border-b-2 border-b-signal"
              data-tour="nav-settings"
            >
              <Settings class="h-4 w-4" />
              <span class="hidden sm:inline">{{ $t('nav.settings') }}</span>
            </NuxtLink>
          </nav>

          <span
            v-if="authStore.isDemoMode"
            class="tabular-telemetry hidden lg:inline-flex border border-signal/40 bg-signal-soft px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-signal shrink-0"
          >
            {{ $t('app.demoBanner') }}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <span
            v-if="authStore.user"
            class="hidden xl:inline-block max-w-[180px] truncate text-ui text-text-muted"
          >
            {{ authStore.user.email || authStore.user.displayName }}
          </span>

          <button
            type="button"
            data-tour="nav-help"
            class="tabular-telemetry btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :aria-label="$t('nav.help')"
            :title="`${$t('nav.help')} [?]`"
            @click="onboardingStore.isHelpSheetOpen = true"
          >
            <HelpCircle class="h-4 w-4 text-signal" />
            <BrandKeycapBadge keys="?" size="sm" class="hidden md:inline-flex" />
          </button>

          <button
            type="button"
            class="tabular-telemetry btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-2.5 text-xs font-medium uppercase text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :aria-label="$t('nav.switchLanguage')"
            @click="toggleLocale"
          >
            <Globe class="h-3.5 w-3.5" />
            <span>{{ locale === 'pt-br' ? 'PT-BR' : 'EN' }}</span>
          </button>

          <ClientOnly>
            <button
              type="button"
              class="btn-press inline-flex h-9 w-9 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              :aria-label="$t('nav.toggleTheme')"
              @click="toggleTheme"
            >
              <Sun v-if="colorMode.value === 'dark'" class="h-4 w-4" />
              <Moon v-else class="h-4 w-4" />
            </button>
            <template #fallback>
              <span class="inline-flex h-9 w-9 border border-border-hairline bg-bg-primary" />
            </template>
          </ClientOnly>

          <button
            type="button"
            class="btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium uppercase text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :aria-label="$t('nav.signOut')"
            @click="handleSignOut"
          >
            <LogOut class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">{{ $t('nav.signOut') }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <slot />
    </main>

    <!-- Global [?] Keyboard Shortcuts & Command Sheet -->
    <OnboardingHelpCommandSheet />
  </div>
</template>
