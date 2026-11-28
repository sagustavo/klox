<script setup lang="ts">
import { Compass, Check, ArrowRight, Briefcase, Target, Layers } from 'lucide-vue-next';
import type { UiSelectOption } from '~/components/ui/Select.vue';
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
  if (!authStore.user) return;
  const uid = authStore.user.uid;
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

const localeSelectOptions: UiSelectOption<SupportedLocale>[] = [
  { value: 'en', label: 'English (EN)' },
  { value: 'pt-br', label: 'Português — Brasil (PT-BR)' },
];

const timeZoneSelectOptions = computed<UiSelectOption<string>[]>(() =>
  timeZoneOptions.value.map((tz) => ({ value: tz, label: tz }))
);

async function setWelcomeLocale(value: SupportedLocale) {
  await setLocale(value);
  await prefsStore.updatePreferences(
    { locale: value },
    authStore.user?.uid,
    authStore.isDemoMode
  );
}

async function setWelcomeTimeZone(value: string) {
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
  if (!authStore.user) return;
  await onboardingStore.skipWizard(authStore.user.uid, authStore.isDemoMode);
  await navigateTo(localePath('/app'));
}

async function handleFinish(startTourAfter: boolean) {
  if (!authStore.user) return;
  const uid = authStore.user.uid;
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
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-5">
      <div>
        <div class="label-eyebrow inline-flex items-center gap-1.5 border border-signal/40 bg-signal-soft px-3 py-1 text-signal">
          {{ $t('onboarding.wizard.badge') }}
        </div>
        <h1 class="display-wide mt-3 text-2xl text-text-primary">
          {{ $t('onboarding.wizard.title') }}
        </h1>
        <p class="mt-1.5 text-sm text-text-muted">
          {{ $t('onboarding.wizard.subtitle') }}
        </p>
      </div>

      <button
        type="button"
        class="btn-press h-9 border border-border-hairline bg-bg-elevated px-3.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
        @click="handleSkipAll"
      >
        {{ $t('onboarding.wizard.skipAll') }}
      </button>
    </div>

    <!-- Step Indicator -->
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button
        type="button"
        class="border px-3.5 py-2.5 text-left text-ui transition-colors"
        :class="
          step === 1
            ? 'border-signal bg-signal-soft text-signal font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted hover:text-text-primary'
        "
        @click="step = 1"
      >
        {{ $t('onboarding.wizard.step1Title') }}
      </button>
      <button
        type="button"
        class="border px-3.5 py-2.5 text-left text-ui transition-colors"
        :class="
          step === 2
            ? 'border-signal bg-signal-soft text-signal font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted hover:text-text-primary'
        "
        @click="step = 2"
      >
        {{ $t('onboarding.wizard.step2Title') }}
      </button>
      <button
        type="button"
        class="border px-3.5 py-2.5 text-left text-ui transition-colors"
        :class="
          step === 3
            ? 'border-signal bg-signal-soft text-signal font-semibold'
            : 'border-border-hairline bg-bg-elevated text-text-muted hover:text-text-primary'
        "
        @click="step = 3"
      >
        {{ $t('onboarding.wizard.step3Title') }}
      </button>
    </div>

    <!-- STEP 1: Regional Preferences -->
    <div v-if="step === 1" class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-6 space-y-5">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div>
        <label class="label-eyebrow block text-text-muted mb-2">
          {{ $t('settings.languageLabel') }}
        </label>
        <UiSelect
          :model-value="prefsStore.preferences.locale"
          :options="localeSelectOptions"
          :aria-label="$t('settings.languageLabel')"
          @update:model-value="setWelcomeLocale($event as SupportedLocale)"
        />
      </div>

      <div>
        <label class="label-eyebrow block text-text-muted mb-2">
          {{ $t('settings.timeZoneLabel') }}
        </label>
        <UiSelect
          tabular
          :model-value="prefsStore.preferences.timeZone"
          :options="timeZoneSelectOptions"
          :aria-label="$t('settings.timeZoneLabel')"
          @update:model-value="setWelcomeTimeZone(String($event))"
        />
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label-eyebrow block text-text-muted mb-2">
            {{ $t('settings.weekStartsOnLabel') }}
          </label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              class="h-10 border text-xs transition-colors"
              :class="
                prefsStore.preferences.weekStartsOn === 1
                  ? 'border-signal bg-signal-soft text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
              "
              @click="onChangeWeekStart(1)"
            >
              {{ $t('settings.weekMonday') }}
            </button>
            <button
              type="button"
              class="h-10 border text-xs transition-colors"
              :class="
                prefsStore.preferences.weekStartsOn === 0
                  ? 'border-signal bg-signal-soft text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
              "
              @click="onChangeWeekStart(0)"
            >
              {{ $t('settings.weekSunday') }}
            </button>
            <button
              type="button"
              class="h-10 border text-xs transition-colors"
              :class="
                prefsStore.preferences.weekStartsOn === 6
                  ? 'border-signal bg-signal-soft text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
              "
              @click="onChangeWeekStart(6)"
            >
              {{ $t('settings.weekSaturday') }}
            </button>
          </div>
        </div>

        <div>
          <label class="label-eyebrow block text-text-muted mb-2">
            {{ $t('settings.hourCycleLabel') }}
          </label>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="tabular-telemetry h-10 border text-xs transition-colors"
              :class="
                prefsStore.preferences.hourCycle === 'h23'
                  ? 'border-signal bg-signal-soft text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
              "
              @click="onChangeHourCycle('h23')"
            >
              24h
            </button>
            <button
              type="button"
              class="tabular-telemetry h-10 border text-xs transition-colors"
              :class="
                prefsStore.preferences.hourCycle === 'h12'
                  ? 'border-signal bg-signal-soft text-text-primary font-semibold'
                  : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
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
          class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
          @click="step = 2"
        >
          <span>{{ $t('onboarding.wizard.nextButton') }}</span>
        </button>
      </div>
    </div>

    <!-- STEP 2: Focus Profile -->
    <div v-else-if="step === 2" class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-6 space-y-4">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="grid grid-cols-1 gap-3">
        <button
          type="button"
          class="flex items-start gap-3.5 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'both'
              ? 'border-signal bg-signal-soft'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'both'"
        >
          <Layers class="h-5 w-5 shrink-0 text-signal mt-0.5" />
          <div>
            <div class="text-base font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profileBoth') }}
            </div>
            <p class="mt-1 text-ui text-text-muted">
              {{ $t('onboarding.wizard.profileBothDesc') }}
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex items-start gap-3.5 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'work'
              ? 'border-signal bg-signal-soft'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'work'"
        >
          <Briefcase class="h-5 w-5 shrink-0 text-signal mt-0.5" />
          <div>
            <div class="text-base font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profileWork') }}
            </div>
            <p class="mt-1 text-ui text-text-muted">
              {{ $t('onboarding.wizard.profileWorkDesc') }}
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex items-start gap-3.5 border p-4 text-left transition-colors"
          :class="
            selectedProfile === 'personal'
              ? 'border-signal bg-signal-soft'
              : 'border-border-hairline bg-bg-primary hover:border-text-muted'
          "
          @click="selectedProfile = 'personal'"
        >
          <Target class="h-5 w-5 shrink-0 text-signal mt-0.5" />
          <div>
            <div class="text-base font-semibold text-text-primary">
              {{ $t('onboarding.wizard.profilePersonal') }}
            </div>
            <p class="mt-1 text-ui text-text-muted">
              {{ $t('onboarding.wizard.profilePersonalDesc') }}
            </p>
          </div>
        </button>
      </div>

      <div class="flex items-center justify-between pt-2">
        <button
          type="button"
          class="btn-press h-10 border border-border-hairline bg-bg-primary px-4 text-xs font-medium text-text-muted hover:text-text-primary"
          @click="step = 1"
        >
          {{ $t('onboarding.wizard.backButton') }}
        </button>

        <button
          type="button"
          class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
          @click="step = 3"
        >
          <span>{{ $t('onboarding.wizard.nextButton') }}</span>
        </button>
      </div>
    </div>

    <!-- STEP 3: Starting Point & Finish -->
    <div v-else class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-6 space-y-5">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="space-y-3">
        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-sm transition-colors"
          :class="
            startingMode === 'templates'
              ? 'border-signal bg-signal-soft text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="startingMode = 'templates'"
        >
          <span>{{ $t('onboarding.wizard.startTemplates') }}</span>
          <Check v-if="startingMode === 'templates'" class="h-4 w-4 text-signal" />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-sm transition-colors"
          :class="
            startingMode === 'import'
              ? 'border-signal bg-signal-soft text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="startingMode = 'import'"
        >
          <span>{{ $t('onboarding.wizard.startImport') }}</span>
          <Check v-if="startingMode === 'import'" class="h-4 w-4 text-signal" />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between border p-4 text-left text-sm transition-colors"
          :class="
            startingMode === 'empty'
              ? 'border-signal bg-signal-soft text-text-primary font-semibold'
              : 'border-border-hairline bg-bg-primary text-text-muted hover:text-text-primary'
          "
          @click="startingMode = 'empty'"
        >
          <span>{{ $t('onboarding.wizard.startEmpty') }}</span>
          <Check v-if="startingMode === 'empty'" class="h-4 w-4 text-signal" />
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          class="btn-press h-10 border border-border-hairline bg-bg-primary px-4 text-xs font-medium text-text-muted hover:text-text-primary"
          @click="step = 2"
        >
          {{ $t('onboarding.wizard.backButton') }}
        </button>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="isSubmitting"
            class="btn-press h-10 border border-border-hairline bg-bg-primary px-4 text-xs font-medium text-text-primary hover:border-signal transition-colors"
            @click="handleFinish(false)"
          >
            {{ $t('onboarding.wizard.finishWithoutTour') }}
          </button>

          <button
            type="button"
            :disabled="isSubmitting"
            class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            @click="handleFinish(true)"
          >
            <Compass class="h-4 w-4" />
            <span>{{ $t('onboarding.wizard.finishWithTour') }}</span>
            <ArrowRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
