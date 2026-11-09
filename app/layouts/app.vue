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
import { useOnboardingStore } from '~/stores/onboarding';
import { usePreferencesStore } from '~/stores/preferences';

const colorMode = useColorMode();
const { locale, setLocale } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const onboardingStore = useOnboardingStore();
const prefsStore = usePreferencesStore();

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
    <header class="sticky top-0 z-30 border-b border-border-hairline bg-bg-elevated">
      <div class="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <div class="flex items-center gap-4 overflow-x-auto">
          <NuxtLink :to="localePath('/app')" class="flex items-center gap-2 shrink-0">
            <BrandKloxLogo size="sm" />
          </NuxtLink>

          <nav class="flex items-center gap-1 text-xs shrink-0">
            <NuxtLink
              :to="localePath('/app')"
              class="inline-flex h-7 items-center gap-1.5 px-2.5 text-text-muted hover:text-text-primary transition-colors"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline"
            >
              <Clock class="h-3.5 w-3.5 text-accent" />
              <span>{{ $t('nav.tracker') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/dashboard')"
              class="inline-flex h-7 items-center gap-1.5 px-2.5 text-text-muted hover:text-text-primary transition-colors"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline"
              data-tour="nav-dashboard"
            >
              <BarChart3 class="h-3.5 w-3.5" />
              <span>{{ $t('nav.dashboard') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/catalog')"
              class="inline-flex h-7 items-center gap-1.5 px-2.5 text-text-muted hover:text-text-primary transition-colors"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline"
              data-tour="nav-catalog"
            >
              <FolderKanban class="h-3.5 w-3.5" />
              <span>{{ $t('nav.catalog') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/import')"
              class="inline-flex h-7 items-center gap-1.5 px-2.5 text-text-muted hover:text-text-primary transition-colors"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline"
              data-tour="nav-import"
            >
              <FileSpreadsheet class="h-3.5 w-3.5" />
              <span>{{ $t('nav.import') }}</span>
            </NuxtLink>

            <NuxtLink
              :to="localePath('/app/settings')"
              class="inline-flex h-7 items-center gap-1.5 px-2.5 text-text-muted hover:text-text-primary transition-colors"
              active-class="!text-text-primary bg-bg-hover border border-border-hairline"
              data-tour="nav-settings"
            >
              <Settings class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">{{ $t('nav.settings') }}</span>
            </NuxtLink>
          </nav>

          <span
            v-if="authStore.isDemoMode"
            class="tabular-telemetry hidden lg:inline-flex border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent shrink-0"
          >
            {{ $t('app.demoBanner') }}
          </span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="authStore.user"
            class="hidden xl:inline-block text-xs font-mono text-text-muted truncate max-w-[160px]"
          >
            {{ authStore.user.email || authStore.user.displayName }}
          </span>

          <button
            type="button"
            data-tour="nav-help"
            class="tabular-telemetry inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2 text-[11px] font-mono text-text-muted hover:text-text-primary"
            :aria-label="$t('nav.help')"
            :title="`${$t('nav.help')} [?]`"
            @click="onboardingStore.isHelpSheetOpen = true"
          >
            <HelpCircle class="h-3.5 w-3.5 text-accent" />
            <span class="hidden md:inline">[?]</span>
          </button>

          <button
            type="button"
            class="tabular-telemetry inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2 text-[11px] font-mono uppercase text-text-muted hover:text-text-primary"
            :aria-label="$t('nav.switchLanguage')"
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

          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 border border-border-hairline bg-bg-primary px-2 text-[11px] font-mono uppercase text-text-muted hover:text-text-primary"
            :aria-label="$t('nav.signOut')"
            @click="handleSignOut"
          >
            <LogOut class="h-3 w-3" />
            <span class="hidden sm:inline">{{ $t('nav.signOut') }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <slot />
    </main>

    <!-- Global [?] Keyboard Shortcuts & Command Sheet -->
    <OnboardingHelpCommandSheet />
  </div>
</template>
