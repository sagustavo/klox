<script setup lang="ts">
import { Check } from 'lucide-vue-next';
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

const { setLocale } = useI18n();
const authStore = useAuthStore();
const prefsStore = usePreferencesStore();
const { formatDuration, formatDate, formatTime, formatDecimalHours } = useFormat(
  () => prefsStore.preferences
);

const savedFlash = ref(false);

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
  savedFlash.value = true;
  setTimeout(() => {
    savedFlash.value = false;
  }, 1500);
}
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
    <div class="lg:col-span-7 border border-border-hairline bg-bg-elevated p-6">
      <div class="flex items-center justify-between border-b border-border-hairline pb-4">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">
            {{ $t('settings.title') }}
          </h1>
          <p class="mt-1 text-xs text-text-muted">
            {{ $t('settings.subtitle') }}
          </p>
        </div>

        <span
          v-if="savedFlash"
          class="inline-flex items-center gap-1 border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase text-accent"
        >
          <Check class="h-3 w-3" />
          <span>{{ $t('settings.savedBadge') }}</span>
        </span>
      </div>

      <div class="mt-6 space-y-5">
        <!-- Interface Language -->
        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('settings.languageLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.locale"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            @change="updateField('locale', ($event.target as HTMLSelectElement).value as SupportedLocale)"
          >
            <option value="en">English (EN)</option>
            <option value="pt-br">Português — Brasil (PT-BR)</option>
          </select>
        </div>

        <!-- IANA Timezone -->
        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('settings.timeZoneLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.timeZone"
            class="tabular-telemetry mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm font-mono text-text-primary focus:border-accent focus:outline-none"
            @change="updateField('timeZone', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="tz in commonTimeZones" :key="tz" :value="tz">
              {{ tz }}
            </option>
          </select>
          <p class="mt-1 text-[11px] text-text-muted">
            {{ $t('settings.timeZoneHelp') }}
          </p>
        </div>

        <!-- Week Starts On -->
        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('settings.weekStartsOnLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.weekStartsOn"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            @change="updateField('weekStartsOn', Number(($event.target as HTMLSelectElement).value) as WeekStartDay)"
          >
            <option :value="0">{{ $t('settings.weekSunday') }}</option>
            <option :value="1">{{ $t('settings.weekMonday') }}</option>
            <option :value="6">{{ $t('settings.weekSaturday') }}</option>
          </select>
        </div>

        <!-- Date Format -->
        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('settings.dateFormatLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.dateFormat"
            class="tabular-telemetry mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm font-mono text-text-primary focus:border-accent focus:outline-none"
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
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('settings.hourCycleLabel') }}
          </label>
          <select
            :value="prefsStore.preferences.hourCycle"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            @change="updateField('hourCycle', ($event.target as HTMLSelectElement).value as HourCyclePreference)"
          >
            <option value="h23">{{ $t('settings.hourCycle24') }}</option>
            <option value="h12">{{ $t('settings.hourCycle12') }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Live Formatting Telemetry Preview -->
    <div class="lg:col-span-5 border border-border-hairline bg-bg-elevated p-6 h-fit">
      <div class="border-b border-border-hairline pb-3 text-xs font-mono uppercase tracking-wider text-accent">
        {{ $t('settings.previewTitle') }}
      </div>

      <dl class="mt-4 space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-text-muted">{{ $t('settings.previewTimer') }}</dt>
          <dd class="tabular-telemetry font-mono text-sm font-semibold text-text-primary">
            {{ formatDuration(6138) }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-text-muted">{{ $t('settings.previewDate') }}</dt>
          <dd class="tabular-telemetry font-mono text-sm text-text-primary">
            {{ formatDate(sampleInstant) }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-text-muted">dateKey (01:30 UTC)</dt>
          <dd class="tabular-telemetry font-mono text-sm text-accent">
            {{ sampleDateKey }}
          </dd>
        </div>

        <div class="flex items-center justify-between border-b border-border-hairline pb-3">
          <dt class="text-text-muted">{{ $t('settings.previewTime') }}</dt>
          <dd class="tabular-telemetry font-mono text-sm text-text-primary">
            {{ formatTime(sampleInstant) }}
          </dd>
        </div>

        <div class="flex items-center justify-between">
          <dt class="text-text-muted">{{ $t('settings.previewDecimal') }}</dt>
          <dd class="tabular-telemetry font-mono text-sm text-text-primary">
            {{ formatDecimalHours(27000) }} h
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>
