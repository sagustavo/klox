import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import type { DateFormatPreset, SupportedLocale, WeekStartDay } from './types';

/**
 * Resilient stopwatch elapsed calculation (GEMINI.md §2.4):
 * ALWAYS derived from startTimeUTC delta, never via naive elapsed++ counters.
 */
export function elapsedSeconds(startTimeUTC: string, nowMs: number = Date.now()): number {
  const startMs = Date.parse(startTimeUTC);
  if (Number.isNaN(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/**
 * Formats seconds into canonical Latin-digit telemetry format HH:MM:SS.
 */
export function formatHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parses an HH:MM:SS (or H:MM:SS / MM:SS) duration string into total seconds.
 * Returns null if invalid.
 */
export function parseHMS(hms: string): number | null {
  const trimmed = hms.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const nums = parts.map((p) => (p !== '' && /^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;

  if (nums.length === 3) {
    const [h, m, s] = nums as [number, number, number];
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = nums as [number, number];
  if (s >= 60) return null;
  return m * 60 + s;
}

/**
 * Computes "YYYY-MM-DD" in the user's preferred IANA timezone (ADR-0005).
 */
export function toDateKey(utcIsoOrDate: string | Date, timeZone: string): string {
  const instant = typeof utcIsoOrDate === 'string' ? new Date(utcIsoOrDate) : utcIsoOrDate;
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid date passed to toDateKey: ${String(utcIsoOrDate)}`);
  }
  try {
    const zoned = new TZDate(instant.getTime(), timeZone);
    return format(zoned, 'yyyy-MM-dd');
  } catch {
    // Fallback to UTC date if an unknown timezone string is supplied
    return format(new TZDate(instant.getTime(), 'UTC'), 'yyyy-MM-dd');
  }
}

/**
 * Normalizes a task description for deduplication and Fuse.js recall templates.
 */
export function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface ParsedTimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Parses a 24-hour time input string ("HH:MM" or "HH:MM:SS") into hours, minutes, and seconds.
 * Returns null if invalid.
 */
export function parseTimeOfDay(value: string): ParsedTimeOfDay | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return { hours, minutes, seconds };
}

/**
 * Formats a UTC ISO timestamp (or Date) as a local 24h `<input type="time">` string
 * ("HH:MM" or "HH:MM:SS") in the user's preferred IANA timezone.
 */
export function toLocalTimeInputValue(
  utcIsoOrDate: string | Date,
  timeZone: string,
  includeSeconds = false
): string {
  const instant = typeof utcIsoOrDate === 'string' ? new Date(utcIsoOrDate) : utcIsoOrDate;
  if (Number.isNaN(instant.getTime())) return includeSeconds ? '00:00:00' : '00:00';
  const pattern = includeSeconds ? 'HH:mm:ss' : 'HH:mm';
  try {
    return format(new TZDate(instant.getTime(), timeZone || 'UTC'), pattern);
  } catch {
    return format(new TZDate(instant.getTime(), 'UTC'), pattern);
  }
}

/**
 * Combines a calendar `dateKey` ("YYYY-MM-DD") and local `timeValue` ("HH:MM" or "HH:MM:SS")
 * in `timeZone` into a canonical UTC ISO-8601 string. Returns null if invalid.
 */
export function zonedDateAndTimeToUtcIso(
  dateKey: string,
  timeValue: string,
  timeZone: string
): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!dateMatch) return null;
  const parsedTime = parseTimeOfDay(timeValue);
  if (!parsedTime) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Validate calendar date (e.g. reject 2026-02-30)
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const effectiveTz = timeZone || 'UTC';
  try {
    const zoned = new TZDate(
      year,
      month - 1,
      day,
      parsedTime.hours,
      parsedTime.minutes,
      parsedTime.seconds,
      0,
      effectiveTz
    );
    if (Number.isNaN(zoned.getTime())) return null;
    return new Date(zoned.getTime()).toISOString();
  } catch {
    const utcFallback = new TZDate(
      year,
      month - 1,
      day,
      parsedTime.hours,
      parsedTime.minutes,
      parsedTime.seconds,
      0,
      'UTC'
    );
    return Number.isNaN(utcFallback.getTime())
      ? null
      : new Date(utcFallback.getTime()).toISOString();
  }
}

function nextCalendarDateKey(dateKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const nextUtc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
  );
  const y = String(nextUtc.getUTCFullYear()).padStart(4, '0');
  const m = String(nextUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nextUtc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ResolvedTimeRange {
  startTimeUTC: string;
  endTimeUTC: string;
  durationSeconds: number;
  spansNextDay: boolean;
}

/**
 * Resolves inline or manual `Start Time` and `Stop Time` inputs on `dateKey` in `timeZone`
 * into UTC ISO bounds and recalculated `durationSeconds` (FR-5.2).
 *
 * If `endTimeInput` is earlier in the day than `startTimeInput` (e.g. 23:30 -> 00:15),
 * `endTimeUTC` automatically rolls onto the next calendar day. Zero-length ranges return null.
 */
export function resolveTimeRange(params: {
  dateKey: string;
  startTimeInput: string;
  endTimeInput: string;
  timeZone: string;
}): ResolvedTimeRange | null {
  const startTimeUTC = zonedDateAndTimeToUtcIso(
    params.dateKey,
    params.startTimeInput,
    params.timeZone
  );
  const sameDayEndUTC = zonedDateAndTimeToUtcIso(
    params.dateKey,
    params.endTimeInput,
    params.timeZone
  );
  if (!startTimeUTC || !sameDayEndUTC) return null;

  const startMs = Date.parse(startTimeUTC);
  const sameDayEndMs = Date.parse(sameDayEndUTC);
  if (sameDayEndMs === startMs) return null;

  if (sameDayEndMs > startMs) {
    const durationSeconds = Math.floor((sameDayEndMs - startMs) / 1000);
    if (durationSeconds <= 0) return null;
    return {
      startTimeUTC,
      endTimeUTC: sameDayEndUTC,
      durationSeconds,
      spansNextDay: false,
    };
  }

  const nextDayKey = nextCalendarDateKey(params.dateKey);
  if (!nextDayKey) return null;
  const nextDayEndUTC = zonedDateAndTimeToUtcIso(
    nextDayKey,
    params.endTimeInput,
    params.timeZone
  );
  if (!nextDayEndUTC) return null;

  const nextDayEndMs = Date.parse(nextDayEndUTC);
  const durationSeconds = Math.floor((nextDayEndMs - startMs) / 1000);
  if (durationSeconds <= 0) return null;

  return {
    startTimeUTC,
    endTimeUTC: nextDayEndUTC,
    durationSeconds,
    spansNextDay: true,
  };
}

/**
 * Resolves an adjusted `startTimeUTC` for a live running `ActiveTimer` from a local
 * `dateKey` + `startTimeInput` in `timeZone`, clamping at `nowMs` so `startTimeUTC`
 * can never be placed in the future (FR-5.2).
 */
export function resolveAdjustedTimerStartUtc(params: {
  dateKey: string;
  startTimeInput: string;
  timeZone: string;
  nowMs?: number;
}): {
  startTimeUTC: string;
  elapsedSeconds: number;
  clampedToNow: boolean;
} | null {
  const candidateIso = zonedDateAndTimeToUtcIso(
    params.dateKey,
    params.startTimeInput,
    params.timeZone
  );
  if (!candidateIso) return null;

  const now = params.nowMs ?? Date.now();
  const candidateMs = Date.parse(candidateIso);
  const clampedToNow = candidateMs > now;
  const effectiveMs = clampedToNow ? now : candidateMs;
  const startTimeUTC = new Date(effectiveMs).toISOString();

  return {
    startTimeUTC,
    elapsedSeconds: elapsedSeconds(startTimeUTC, now),
    clampedToNow,
  };
}

/**
 * Shifts a running `ActiveTimer.startTimeUTC` by `deltaMinutes` (negative = backdate earlier,
 * positive = move start forward, clamped at `nowMs`). Returns the updated UTC ISO string.
 */
export function shiftTimerStartByMinutes(
  currentStartTimeUTC: string,
  deltaMinutes: number,
  nowMs: number = Date.now()
): string | null {
  const currentMs = Date.parse(currentStartTimeUTC);
  if (Number.isNaN(currentMs) || !Number.isFinite(deltaMinutes)) return null;
  const shiftedMs = Math.min(nowMs, currentMs + Math.round(deltaMinutes * 60_000));
  return new Date(shiftedMs).toISOString();
}

/**
 * Checks whether two `[startTime, endTime)` intervals overlap in time.
 * Note: Klox intentionally permits overlapping TimeLogs without blocking validation (FR-5.2).
 */
export function doTimeRangesOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string }
): boolean {
  const aStart = Date.parse(a.startTime);
  const aEnd = Date.parse(a.endTime);
  const bStart = Date.parse(b.startTime);
  const bEnd = Date.parse(b.endTime);
  if (
    Number.isNaN(aStart) ||
    Number.isNaN(aEnd) ||
    Number.isNaN(bStart) ||
    Number.isNaN(bEnd)
  ) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
}

export type DateComponentOrder = 'YMD' | 'DMY' | 'MDY';

function isValidCalendarYMD(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1970 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function toCanonicalDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves the preferred component ordering (`YMD`, `DMY`, `MDY`) from `UserPreferences`.
 */
export function resolvePreferredDateOrder(
  dateFormat: DateFormatPreset,
  locale: SupportedLocale = 'en'
): DateComponentOrder {
  if (dateFormat === 'DD/MM/YYYY') return 'DMY';
  if (dateFormat === 'MM/DD/YYYY') return 'MDY';
  if (dateFormat === 'YYYY-MM-DD') return 'YMD';
  return locale === 'pt-br' ? 'DMY' : 'YMD';
}

/**
 * Returns the human-readable placeholder string matching the user's date format preference.
 */
export function getDateInputPlaceholder(
  dateFormat: DateFormatPreset,
  locale: SupportedLocale = 'en'
): string {
  const order = resolvePreferredDateOrder(dateFormat, locale);
  if (order === 'DMY') return 'DD/MM/YYYY';
  if (order === 'MDY') return 'MM/DD/YYYY';
  return 'YYYY-MM-DD';
}

/**
 * Formats a canonical `"YYYY-MM-DD"` `dateKey` into the user's preferred editable text format.
 */
export function formatDateKeyForInput(
  dateKey: string,
  dateFormat: DateFormatPreset,
  locale: SupportedLocale = 'en'
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return dateKey;
  const [, y, m, d] = match;
  const order = resolvePreferredDateOrder(dateFormat, locale);
  if (order === 'DMY') return `${d}/${m}/${y}`;
  if (order === 'MDY') return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;
}

/**
 * Parses normal user-typed dates (`YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `MM/DD/YYYY`,
 * `DD-MM-YYYY`, `DD.MM.YYYY`) into a validated canonical `"YYYY-MM-DD"` `dateKey`.
 *
 * Unambiguous day > 12 automatically resolves `DMY` vs `MDY`; ambiguous dates (`<= 12`)
 * follow `preferredOrder`. Returns `null` if incomplete or invalid.
 */
export function parseFlexibleDateInput(
  raw: string,
  preferredOrder: DateComponentOrder = 'YMD'
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Leading 4-digit year: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymdMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    return isValidCalendarYMD(year, month, day)
      ? toCanonicalDateKey(year, month, day)
      : null;
  }

  // 2. Trailing 4-digit year: DD/MM/YYYY or MM/DD/YYYY (with /, -, or .)
  const trailingYearMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (trailingYearMatch) {
    const first = Number(trailingYearMatch[1]);
    const second = Number(trailingYearMatch[2]);
    const year = Number(trailingYearMatch[3]);

    let month: number;
    let day: number;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else if (preferredOrder === 'MDY') {
      month = first;
      day = second;
    } else {
      // Both DMY and YMD fall back to DMY when user types slash-separated trailing year (e.g. 05/11/2026)
      day = first;
      month = second;
    }

    return isValidCalendarYMD(year, month, day)
      ? toCanonicalDateKey(year, month, day)
      : null;
  }

  return null;
}

export interface CalendarGridCell {
  dateKey: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
}

/**
 * Builds a 42-cell (6-week) calendar month grid respecting `weekStartsOn` (0=Sun, 1=Mon, 6=Sat).
 */
export function buildCalendarMonthGrid(params: {
  year: number;
  month: number; // 1..12
  weekStartsOn: WeekStartDay;
}): CalendarGridCell[] {
  const { year, month, weekStartsOn } = params;
  const firstOfMonthUtc = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstOfMonthUtc.getUTCDay(); // 0..6
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;

  const cells: CalendarGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - leadingDays;
    const cellUtc = new Date(Date.UTC(year, month - 1, 1 + dayOffset));
    const cy = cellUtc.getUTCFullYear();
    const cm = cellUtc.getUTCMonth() + 1;
    const cd = cellUtc.getUTCDate();
    cells.push({
      dateKey: toCanonicalDateKey(cy, cm, cd),
      dayOfMonth: cd,
      inCurrentMonth: cy === year && cm === month,
    });
  }

  return cells;
}

export interface DynamicTabTitleInput {
  elapsedSeconds: number;
  description: string;
  projectName?: string | null;
  isUnassignedProject?: boolean;
  brandName?: string;
  maxDescriptionLength?: number;
}

function truncateWithEllipsis(value: string, maxLength: number): string {
  const safeMax = Math.max(2, Math.floor(maxLength));
  if (value.length <= safeMax) return value;
  return `${value.slice(0, safeMax - 1).trimEnd()}…`;
}

/**
 * Formats a live active timer browser tab title:
 * `{H:MM:SS} | {activity description} | {project} • Klox`
 * Omitting unassigned fallback project noise and empty descriptions cleanly.
 */
export function formatDynamicTabTitle(input: DynamicTabTitleInput): string {
  const safeSeconds =
    Number.isFinite(input.elapsedSeconds) && input.elapsedSeconds > 0
      ? Math.floor(input.elapsedSeconds)
      : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const timerText = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const brand = input.brandName?.trim() || 'Klox';
  const maxDescLen = input.maxDescriptionLength ?? 40;

  const cleanDesc = input.description.trim().replace(/\s+/g, ' ');
  const truncatedDesc = cleanDesc ? truncateWithEllipsis(cleanDesc, maxDescLen) : '';
  const cleanProject =
    !input.isUnassignedProject && input.projectName
      ? input.projectName.trim().replace(/\s+/g, ' ')
      : '';

  const segments = [timerText];
  if (truncatedDesc) segments.push(truncatedDesc);
  if (cleanProject) segments.push(cleanProject);

  return `${segments.join(' | ')} • ${brand}`;
}

/**
 * Formats the idle workspace browser tab title: `{Section} • Klox`.
 */
export function formatIdleTabTitle(sectionLabel: string, brandName = 'Klox'): string {
  const brand = brandName.trim() || 'Klox';
  const section = sectionLabel.trim();
  return section ? `${section} • ${brand}` : brand;
}
