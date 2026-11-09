<script setup lang="ts">
import { Compass, Check, ArrowRight, Briefcase, Target, Layers } from 'lucide-vue-next';
import { COMMON_IANA_TIMEZONES } from '~/domain/preferences';
import type {
  HourCyclePreference,
  OnboardingProfile,
  SupportedLocale,
  WeekStartDay,
} from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useOnboardingStore } from '~/stores/onboarding';
import { usePreferencesStore } from '~/stores/preferences';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { setLocale } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const prefsStore = usePreferencesStore();
const catalogStore = useCatalogStore();
const onboardingStore = useOnboardingStore();

const step = ref<1 | 2 | 3>(1);
const selectedProfile = ref<OnboardingProfile>('both');
const startingMode = ref<'templates' | 'import' | 'empty'>('templates');
const isSubmitting = ref(false);

onMounted(async () => {
  await authStore.init();
  const uid = authStore.user?.uid ?? 'demo-user';
  await Promise.all([
    prefsStore.hydrate(uid, authStore.isDemoMode),
    catalogStore.hydrate(uid, authStore.isDemoMode),
    onboardingStore.hydrate(uid, authStore.isDemoMode),
  ]);
});

const timeZoneOptions = computed(() => {
  const current = prefsStore.preferences.timeZone;
  if (COMMON_IANA_TIMEZONES.includes(current)) {
    return COMMON_IANA_TIMEZONES;
  }
  return [current, ...COMMON_IANA_TIMEZONES];
});

async function onChangeLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value as SupportedLocale;
  await setLocale(value);
  await prefsStore.updatePreferences(
    { locale: value },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function onChangeTimeZone(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  await prefsStore.updatePreferences(
    { timeZone: value },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function onChangeWeekStart(day: WeekStartDay) {
  await prefsStore.updatePreferences(
    { weekStartsOn: day },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function onChangeHourCycle(cycle: HourCyclePreference) {
  await prefsStore.updatePreferences(
    { hourCycle: cycle },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function handleSkipAll() {
  const uid = authStore.user?.uid ?? 'demo-user';
  await onboardingStore.skipWizard(uid, authStore.isDemoMode);
  await navigateTo(localePath('/app'));
}

async function handleFinish(startTourAfter: boolean) {
  const uid = authStore.user?.uid ?? 'demo-user';
  isSubmitting.value = true;
  try {
    await onboardingStore.completeWizard({
      uid,
      isDemo: authStore.isDemoMode,
      profile: selectedProfile.value,
      seedStarterCatalog: startingMode.value === 'templates',
      locale: prefsStore.preferences.locale,
      startTourAfter,
    });

    if (startingMode.value === 'import') {
      await navigateTo(localePath('/app/import'));
    } else {
      await navigateTo(localePath('/app'));
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 py-4">
    <!-- Top Banner -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
      <div>
        <div class="inline-flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
          {{ $t('onboarding.wizard.badge') }}
        </div>
        <h1 class="mt-2 text-xl font-semibold tracking-tight">
          {{ $t('onboarding.wizard.title') }}
        </h1>
        <p class="mt-0.5 text-xs text-text-muted">
          {{ $t('onboarding.wizard.subtitle') }}
        </p>
      </div>

      <button
        type="button"
        class="h-8 border border-border-hairline bg-bg-elevated px-3 font-mono text-xs text-text-muted hover:text-text-primary"
        @click="handleSkipAll"
      >
        {{ $t('onboarding.wizard.skipAll') }}
      </button>
    </div>

    <!-- Step Indicator -->
    <div class="grid grid-cols-3 gap-2">
      <button
        type="button"
        class="border px-3 py-2 text-left font-mono text-xs transition-colors"
        :class="
          step === 1
            ? 'border-accent bg-accent/10 text-accent font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted'
        "
        @click="step = 1"
      >
        {{ $t('onboarding.wizard.step1Title') }}
      </button>
      <button
        type="button"
        class="border px-3 py-2 text-left font-mono text-xs transition-colors"
        :class="
          step === 2
            ? 'border-accent bg-accent/10 text-accent font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted'
        "
        @click="step = 2"
      >
        {{ $t('onboarding.wizard.step2Title') }}
      </button>
      <button
        type="button"
        class="border px-3 py-2 text-left font-mono text-xs transition-colors"
        :class="
          step === 3
            ? 'border-accent bg-accent/10 text-accent font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted'
        "
        @click="step = 3"
      >
        {{ $t('onboarding.wizard.step3Title') }}
      </button>
    </div>

    <!-- STEP 1: Regional Preferences -->
    <div v-if="step === 1" class="border border-border-hairline bg-bg-elevated p-6 space-y-5">
      <div>
        <label class="block text-xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
          {{ $t('settings.languageLabel') }}
        </label>
        <select
          :value="prefsStore.preferences.locale"
          class="h-10 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          @change="onChangeLocale"
        >
          <option value="en">English (en)</option>
          <option value="pt-br">Português — Brasil (pt-BR)</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
          {{ $t('settings.timeZoneLabel') }}
        </label>
        <select
          :value="prefsStore.preferences.timeZone"
          class="h-10 w-full border border-border-hairline bg-bg-primary px-3 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
          @change="onChangeTimeZone"
        >
          <option v-for="tz in timeZoneOptions" :key="tz" :value="tz">
            {{ tz }}
          </option>
        </select>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
            {{ $t('settings.weekStartsOnLabel') }}
          </label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              class="h-9 border text-xs font-mono"
              :class="
                prefsStore.preferences.weekStartsOn === 1
                  ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted'
              "
              @click="onChangeWeekStart(1)"
            >
              {{ $t('settings.weekMonday') }}
            </button>
            <button
              type="button"
              class="h-9 border text-xs font-mono"
              :class="
                prefsStore.preferences.weekStartsOn === 0
                  ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted'
              "
              @click="onChangeWeekStart(0)"
            >
              {{ $t('settings.weekSunday') }}
            </button>
            <button
              type="button"
              class="h-9 border text-xs font-mono"
              :class="
                prefsStore.preferences.weekStartsOn === 6
                  ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted'
              "
              @click="onChangeWeekStart(6)"
            >
              {{ $t('settings.weekSaturday') }}
            </button>
          </div>
        </div>

        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted mb-1.5">
            {{ $t('settings.hourCycleLabel') }}
          </label>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="h-9 border text-xs font-mono"
              :class="
                prefsStore.preferences.hourCycle === 'h23'
                  ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted'
              "
              @click="onChangeHourCycle('h23')"
            >
              24h
            </button>
            <button
              type="button"
              class="h-9 border text-xs font-mono"
              :class="
                prefsStore.preferences.hourCycle === 'h12'
                  ? 'border-accent bg-accent/15 text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted'
              "
              @click="onChangeHourCycle('h12')"
            >
              12h
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 bg-accent px-5 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent/90"
          @click="step = 2"
        >
          <span>{{ $t('onboarding.wizard.nextButton') }}</span>
        </button>
      </div>
    </div>

    <!-- STEP 2: Execution Profile -->
    <div v-else-if="step === 2" class="border border-border-hairline bg-bg-elevated p-6 space-y-4">
      <div class="grid grid-cols-1 gap-3">
        <button
          type="button"
          class="flex items-start gap-3 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'both'
              ? 'border-accent bg-accent/10'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'both'"
        >
          <Layers class="h-5 w-5 shrink-0 text-accent mt-0.5" />
          <div>
            <div class="text-sm font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profileBoth') }}
            </div>
            <p class="mt-0.5 text-xs text-text-muted">
              {{ $t('onboarding.wizard.profileBothDesc') }}
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex items-start gap-3 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'work'
              ? 'border-accent bg-accent/10'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'work'"
        >
          <Briefcase class="h-5 w-5 shrink-0 text-accent mt-0.5" />
          <div>
            <div class="text-sm font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profileWork') }}
            </div>
            <p class="mt-0.5 text-xs text-text-muted">
              {{ $t('onboarding.wizard.profileWorkDesc') }}
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex items-start gap-3 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'personal'
              ? 'border-accent bg-accent/10'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'personal'"
        >
          <Target class="h-5 w-5 shrink-0 text-accent mt-0.5" />
          <div>
            <div class="text-sm font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profilePersonal') }}
            </div>
            <p class="mt-0.5 text-xs text-text-muted">
              {{ $t('onboarding.wizard.profilePersonalDesc') }}
            </p>
          </div>
        </button>
      </div>

      <div class="flex items-center justify-between pt-2">
        <button
          type="button"
          class="h-10 border border-border-hairline bg-bg-primary px-4 font-mono text-xs text-text-muted hover:text-text-primary"
          @click="step = 1"
        >
          {{ $t('onboarding.wizard.backButton') }}
        </button>

        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 bg-accent px-5 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent/90"
          @click="step = 3"
        >
          <span>{{ $t('onboarding.wizard.nextButton') }}</span>
        </button>
      </div>
    </div>

    <!-- STEP 3: Starting Point & Finish -->
    <div v-else class="border border-border-hairline bg-bg-elevated p-6 space-y-5">
      <div class="space-y-2.5">
        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-xs font-mono transition-colors"
          :class="
            startingMode === 'templates'
              ? 'border-accent bg-accent/10 text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted'
          "
          @click="startingMode = 'templates'"
        >
          <span>{{ $t('onboarding.wizard.startTemplates') }}</span>
          <Check v-if="startingMode === 'templates'" class="h-4 w-4 text-accent" />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-xs font-mono transition-colors"
          :class="
            startingMode === 'import'
              ? 'border-accent bg-accent/10 text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted'
          "
          @click="startingMode = 'import'"
        >
          <span>{{ $t('onboarding.wizard.startImport') }}</span>
          <Check v-if="startingMode === 'import'" class="h-4 w-4 text-accent" />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-xs font-mono transition-colors"
          :class="
            startingMode === 'empty'
              ? 'border-accent bg-accent/10 text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted'
          "
          @click="startingMode = 'empty'"
        >
          <span>{{ $t('onboarding.wizard.startEmpty') }}</span>
          <Check v-if="startingMode === 'empty'" class="h-4 w-4 text-accent" />
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          class="h-10 border border-border-hairline bg-bg-primary px-4 font-mono text-xs text-text-muted hover:text-text-primary"
          @click="step = 2"
        >
          {{ $t('onboarding.wizard.backButton') }}
        </button>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="isSubmitting"
            class="h-10 border border-border-hairline bg-bg-primary px-4 font-mono text-xs text-text-primary hover:border-accent"
            @click="handleFinish(false)"
          >
            {{ $t('onboarding.wizard.finishWithoutTour') }}
          </button>

          <button
            type="button"
            :disabled="isSubmitting"
            class="inline-flex h-10 items-center gap-2 bg-accent px-5 font-mono text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent/90"
            @click="handleFinish(true)"
          >
            <Compass class="h-4 w-4" />
            <span>{{ $t('onboarding.wizard.finishWithTour') }}</span>
            <ArrowRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
