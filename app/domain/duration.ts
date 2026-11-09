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
