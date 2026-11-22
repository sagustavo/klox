import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

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
