import type { SupportedLocale, UserPreferences, WeekStartDay } from './types';

export const DEFAULT_PREFERENCES: UserPreferences = {
  locale: 'en',
  timeZone: 'UTC',
  weekStartsOn: 1,
  dateFormat: 'locale',
  hourCycle: 'h23',
};

export function matchSupportedLocale(languages: readonly string[] | undefined): SupportedLocale {
  if (!languages || languages.length === 0) return 'en';
  for (const raw of languages) {
    const lower = raw.toLowerCase();
    if (lower === 'pt-br' || lower.startsWith('pt')) return 'pt-br';
    if (lower === 'en' || lower.startsWith('en-')) return 'en';
  }
  return 'en';
}

export function defaultWeekStartForLocale(locale: SupportedLocale): WeekStartDay {
  // Both US English and Brazil officially use Sunday (0) in CLDR, though many engineers prefer Monday (1).
  // Use Intl.Locale#getWeekInfo when available in the runtime, otherwise default to Monday (1) for EN and Sunday (0) for pt-BR.
  try {
    const intlLocale = new Intl.Locale(locale === 'pt-br' ? 'pt-BR' : 'en-US') as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo;
    if (info) {
      if (info.firstDay === 7) return 0;
      if (info.firstDay === 1) return 1;
      if (info.firstDay === 6) return 6;
    }
  } catch {
    // Ignore and fall through
  }
  return locale === 'pt-br' ? 0 : 1;
}

export function detectBrowserPreferences(
  nav?: Pick<Navigator, 'languages' | 'language'>
): UserPreferences {
  const langs = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : ['en'];
  const locale = matchSupportedLocale(langs);

  let timeZone = 'UTC';
  let hourCycle: 'h12' | 'h23' = locale === 'pt-br' ? 'h23' : 'h12';

  try {
    const resolved = new Intl.DateTimeFormat(locale === 'pt-br' ? 'pt-BR' : 'en-US', {
      hour: 'numeric',
    }).resolvedOptions();
    if (resolved.timeZone) timeZone = resolved.timeZone;
    if (resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12') {
      hourCycle = 'h12';
    } else if (resolved.hourCycle === 'h23' || resolved.hourCycle === 'h24') {
      hourCycle = 'h23';
    }
  } catch {
    // Keep safe defaults
  }

  return {
    locale,
    timeZone,
    weekStartsOn: defaultWeekStartForLocale(locale),
    dateFormat: 'locale',
    hourCycle,
  };
}
