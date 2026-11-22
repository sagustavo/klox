import { formatHMS } from '~/domain/duration';
import { DEFAULT_PREFERENCES } from '~/domain/preferences';
import type { UserPreferences } from '~/domain/types';

/**
 * Central regional formatting composable (ADR-0005).
 * Live timers and durations ALWAYS render HH:MM:SS in Latin digits (telemetry invariant).
 */
export function useFormat(prefsOverride?: MaybeRefOrGetter<UserPreferences>) {
  const { locale } = useI18n();

  const resolvedPrefs = computed<UserPreferences>(() => {
    if (prefsOverride) return toValue(prefsOverride);
    return {
      ...DEFAULT_PREFERENCES,
      locale: locale.value === 'pt-br' ? 'pt-br' : 'en',
    };
  });

  const intlLocale = computed(() => (resolvedPrefs.value.locale === 'pt-br' ? 'pt-BR' : 'en-US'));

  function formatDuration(seconds: number): string {
    return formatHMS(seconds);
  }

  function formatDecimalHours(seconds: number, fractionDigits = 1): string {
    const hours = seconds / 3600;
    return new Intl.NumberFormat(intlLocale.value, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(hours);
  }

  function formatDate(utcIsoOrDate: string | Date): string {
    const date = typeof utcIsoOrDate === 'string' ? new Date(utcIsoOrDate) : utcIsoOrDate;
    if (Number.isNaN(date.getTime())) return '';
    const { dateFormat, timeZone } = resolvedPrefs.value;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';

    if (dateFormat === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
    if (dateFormat === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
    if (dateFormat === 'MM/DD/YYYY') return `${m}/${d}/${y}`;

    return new Intl.DateTimeFormat(intlLocale.value, {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  function formatDateKey(dateKey: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match || !match[1] || !match[2] || !match[3]) return dateKey;
    const y = match[1];
    const m = match[2];
    const d = match[3];
    const { dateFormat } = resolvedPrefs.value;

    if (dateFormat === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
    if (dateFormat === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
    if (dateFormat === 'MM/DD/YYYY') return `${m}/${d}/${y}`;

    const safeUtcNoon = new Date(`${y}-${m}-${d}T12:00:00.000Z`);
    return new Intl.DateTimeFormat(intlLocale.value, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(safeUtcNoon);
  }

  function formatTime(utcIsoOrDate: string | Date): string {
    const date = typeof utcIsoOrDate === 'string' ? new Date(utcIsoOrDate) : utcIsoOrDate;
    if (Number.isNaN(date.getTime())) return '';
    const { hourCycle, timeZone } = resolvedPrefs.value;
    return new Intl.DateTimeFormat(intlLocale.value, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle,
    }).format(date);
  }

  return {
    formatDuration,
    formatDecimalHours,
    formatDate,
    formatDateKey,
    formatTime,
  };
}
