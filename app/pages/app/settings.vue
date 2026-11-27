<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from 'lucide-vue-next';
import { toDateKey } from '~/domain/duration';
import type {
  DateFormatPreset,
  HourCyclePreference,
  SupportedLocale,
  WeekStartDay,
} from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { usePreferencesStore } from '~/stores/preferences';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const colorMode = useColorMode();
const { setLocale } = useI18n();
const authStore = useAuthStore();
const prefsStore = usePreferencesStore();
const { formatDuration, formatDate, formatTime, formatDecimalHours } = useFormat(
  () => prefsStore.preferences
);

type ThemeOption = 'dark' | 'light' | 'system';

const themeOptions = computed<Array<{ value: ThemeOption; labelKey: string; icon: Component }>>(
  () => [
    { value: 'dark', labelKey: 'settings.themeDark', icon: Moon },
    { value: 'light', labelKey: 'settings.themeLight', icon: Sun },
    { value: 'system', labelKey: 'settings.themeSystem', icon: Monitor },
  ]
);

const savedFlash = ref(false);
let savedFlashTimer: ReturnType<typeof setTimeout> | null = null;

function flashSaved() {
  savedFlash.value = true;
  if (savedFlashTimer) {
    clearTimeout(savedFlashTimer);
  }
  savedFlashTimer = setTimeout(() => {
    savedFlash.value = false;
  }, 1500);
}

onBeforeUnmount(() => {
  if (savedFlashTimer) {
    clearTimeout(savedFlashTimer);
  }
});

const commonTimeZones = computed(() => {
  const base = [
    'America/Sao_Paulo',
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Lisbon',
    'Europe/Berlin',
    'Asia/Tokyo',
  ];
  const current = prefsStore.preferences.timeZone;
  return base.includes(current) ? base : [current, ...base];
});

const sampleInstant = new Date('2026-11-09T01:30:00.000Z');
const sampleDateKey = computed(() =>
  toDateKey(sampleInstant, prefsStore.preferences.timeZone)
);

async function updateField<K extends keyof typeof prefsStore.preferences>(
  key: K,
  value: (typeof prefsStore.preferences)[K]
) {
  if (key === 'locale') {
    await setLocale(value as SupportedLocale);
  }
  await prefsStore.updatePreferences(
    { [key]: value },
    authStore.user?.uid,
    authStore.isDemoMode
  );
  flashSaved();
}

function updateThemePreference(theme: ThemeOption) {
  colorMode.preference = theme;
  flashSaved();
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
    <div class="relative overflow-hidden lg:col-span-7 border border-border-hairline bg-bg-elevated p-6">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex items-center justify-between border-b border-border-hairline pb-4">
        <div>
          <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
            {{ $t('settings.title') }}
          </h1>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('settings.subtitle') }}
          </p>
        </div>

        <span
          v-if="savedFlash"
          class="inline-flex items-center gap-1.5 border border-signal/40 bg-signal-soft px-2.5 py-1 text-xs font-semibold uppercase text-signal"
        >
          <Check class="h-3.5 w-3.5" />
          <span>{{ $t('settings.savedBadge') }}</span>
        </span>
      </div>

      <div class="mt-6 space-y-5">
        <!-- Appearance / Theme -->
        <div>
          <span id="settings-theme-label" class="label-eyebrow block text-text-muted">
            {{ $t('settings.themeLabel') }}
          </span>
          <ClientOnly>
            <div
              role="radiogroup"
              aria-labelledby="settings-theme-label"
              class="mt-2 grid grid-cols-3 gap-2"
            >
              <button
                v-for="option in themeOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="colorMode.preference === option.value"
                class="btn-press inline-flex h-10 items-center justify-center gap-2 border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :class="
                  colorMode.preference === option.value
                    ? 'border-signal bg-signal-soft text-text-primary'
                    : 'border-border-input bg-bg-primary text-text-muted hover:bg-bg-hover hover:text-text-primary'
                "
                @click="updateThemePreference(option.value)"
              >
                <component
                  :is="option.icon"
                  class="h-4 w-4 shrink-0"
                  :class="colorMode.preference === option.value ? 'text-signal' : ''"
                  aria-hidden="true"
                />
                <span>{{ $t(option.labelKey) }}</span>
              </button>
            </div>
            <template #fallback>
              <div class="mt-2 grid grid-cols-3 gap-2" aria-hidden="true">
                <span class="h-10 border border-border-input bg-bg-primary" />
                <span class="h-10 border border-border-input bg-bg-primary" />
                <span class="h-10 border border-border-input bg-bg-primary" />
              </div>
            </template>
          </ClientOnly>
          <p class="mt-1.5 text-ui text-text-muted">
            {{ $t('settings.themeHelp') }}
          </p>
        </div>

        <!-- Interface Language -->
        <div>
          <label class="label-eyebrow block text-text-muted">
            {{ $t('settings.languageLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.locale"
            class="mt-2 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="updateField('locale', ($event.target as HTMLSelectElement).value as SupportedLocale)"
          >
            <option value="en">English (EN)</option>
            <option value="pt-br">Português — Brasil (PT-BR)</option>
          </select>
        </div>

        <!-- Timezone -->
        <div>
          <label class="label-eyebrow block text-text-muted">
            {{ $t('settings.timeZoneLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.timeZone"
            class="tabular-telemetry mt-2 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="updateField('timeZone', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="tz in commonTimeZones" :key="tz" :value="tz">
              {{ tz }}
            </option>
          </select>
          <p class="mt-1.5 text-ui text-text-muted">
            {{ $t('settings.timeZoneHelp') }}
          </p>
        </div>

        <!-- Week Starts On -->
        <div>
          <label class="label-eyebrow block text-text-muted">
            {{ $t('settings.weekStartsOnLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.weekStartsOn"
            class="mt-2 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="updateField('weekStartsOn', Number(($event.target as HTMLSelectElement).value) as WeekStartDay)"
          >
            <option :value="0">{{ $t('settings.weekSunday') }}</option>
            <option :value="1">{{ $t('settings.weekMonday') }}</option>
            <option :value="6">{{ $t('settings.weekSaturday') }}</option>
          </select>
        </div>

        <!-- Date Format -->
        <div>
          <label class="label-eyebrow block text-text-muted">
            {{ $t('settings.dateFormatLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.dateFormat"
            class="tabular-telemetry mt-2 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="updateField('dateFormat', ($event.target as HTMLSelectElement).value as DateFormatPreset)"
          >
            <option value="locale">{{ $t('settings.dateFormatLocale') }}</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          </select>
        </div>

        <!-- Clock Hour Cycle -->
        <div>
          <label class="label-eyebrow block text-text-muted">
            {{ $t('settings.hourCycleLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.hourCycle"
            class="mt-2 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="updateField('hourCycle', ($event.target as HTMLSelectElement).value as HourCyclePreference)"
          >
            <option value="h23">{{ $t('settings.hourCycle24') }}</option>
            <option value="h12">{{ $t('settings.hourCycle12') }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Live Formatting Preview -->
    <div class="relative overflow-hidden lg:col-span-5 border border-border-hairline bg-bg-elevated p-6 h-fit">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="label-eyebrow border-b border-border-hairline pb-3 text-signal">
        {{ $t('settings.previewTitle') }}
      </div>

      <dl class="mt-4 space-y-4 text-sm">
        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-ui text-text-muted">{{ $t('settings.previewTimer') }}</dt>
          <dd class="tabular-telemetry text-base font-semibold text-text-primary">
            {{ formatDuration(6138) }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-ui text-text-muted">{{ $t('settings.previewDate') }}</dt>
          <dd class="tabular-telemetry text-sm text-text-primary">
            {{ formatDate(sampleInstant) }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-ui text-text-muted">{{ $t('settings.previewDayBoundary') }}</dt>
          <dd class="tabular-telemetry text-sm text-signal">
            {{ sampleDateKey }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-ui text-text-muted">{{ $t('settings.previewTime') }}</dt>
          <dd class="tabular-telemetry text-sm text-text-primary">
            {{ formatTime(sampleInstant) }}
          </dd>
        </div>

        <div class="flex items-center justify-between">
          <dt class="text-ui text-text-muted">{{ $t('settings.previewDecimal') }}</dt>
          <dd class="tabular-telemetry text-sm text-text-primary">
            {{ formatDecimalHours(27000) }} h
          </dd>
        </div>
      </dl>
    </div>
    </div>

    <SettingsConnectedAccountsPanel @saved="flashSaved" />

    <SettingsAdoIntegrationPanel @saved="flashSaved" />

    <SettingsKeyboardShortcutsPanel id="shortcuts" @saved="flashSaved" />
  </div>
</template>
