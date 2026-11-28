import { toDateKey } from './duration';
import { resolveLogDateKey } from './trackerFeed';
import type {
  ActivityHeatmapData,
  HeatmapDayCell,
  HeatmapIntensityLevel,
  HeatmapMonthLabel,
  HeatmapRangeSelection,
  TimeLog,
  WeekStartDay,
} from './types';

function parseDateKeyUtc(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return new Date(Date.UTC(2026, 0, 1));
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateKeyUtc(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const base = parseDateKeyUtc(dateKey);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return formatDateKeyUtc(base);
}

function weekdayOfDateKey(dateKey: string): number {
  return parseDateKeyUtc(dateKey).getUTCDay();
}

export function extractAvailableHeatmapYears(
  logs: readonly TimeLog[],
  timeZone: string,
  now?: Date
): number[] {
  const effectiveTz = timeZone || 'UTC';
  const currentYear = Number(toDateKey(now ?? new Date(), effectiveTz).slice(0, 4));
  const years = new Set<number>([currentYear]);

  for (const log of logs) {
    const dk = resolveLogDateKey(log, effectiveTz);
    const yr = Number(dk.slice(0, 4));
    if (Number.isInteger(yr) && yr >= 1970 && yr <= 2100) {
      years.add(yr);
    }
  }

  return Array.from(years).sort((a, b) => b - a);
}

export function computeHeatmapIntensityLevel(
  seconds: number,
  p90Seconds: number
): HeatmapIntensityLevel {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const scaleMax = Math.max(p90Seconds, 3600);
  const ratio = seconds / scaleMax;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function daySpanInclusive(startKey: string, endKey: string): number {
  const startMs = parseDateKeyUtc(startKey).getTime();
  const endMs = parseDateKeyUtc(endKey).getTime();
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function buildActivityHeatmap(params: {
  logs: readonly TimeLog[];
  timeZone: string;
  weekStartsOn: WeekStartDay;
  range: HeatmapRangeSelection;
  customBounds?: { startDateKey?: string | null; endDateKey?: string | null };
  now?: Date;
}): ActivityHeatmapData {
  const effectiveTz = params.timeZone || 'UTC';
  const todayKey = toDateKey(params.now ?? new Date(), effectiveTz);

  const allDayMap = new Map<string, { totalSeconds: number; logCount: number }>();
  for (const log of params.logs) {
    const dk = resolveLogDateKey(log, effectiveTz);
    const existing = allDayMap.get(dk);
    if (!existing) {
      allDayMap.set(dk, { totalSeconds: log.durationSeconds, logCount: 1 });
    } else {
      existing.totalSeconds += log.durationSeconds;
      existing.logCount += 1;
    }
  }

  let startDateKey: string;
  let endDateKey: string;
  if (params.range === 'filtered') {
    const rawStart = params.customBounds?.startDateKey || null;
    const rawEnd = params.customBounds?.endDateKey || null;
    if (rawStart && rawEnd && rawStart <= rawEnd) {
      endDateKey = rawEnd;
      startDateKey =
        daySpanInclusive(rawStart, rawEnd) > 366 ? addDaysToDateKey(rawEnd, -364) : rawStart;
    } else if (rawStart) {
      endDateKey = todayKey >= rawStart ? todayKey : rawStart;
      startDateKey =
        daySpanInclusive(rawStart, endDateKey) > 366
          ? addDaysToDateKey(endDateKey, -364)
          : rawStart;
    } else if (rawEnd) {
      endDateKey = rawEnd;
      startDateKey = addDaysToDateKey(rawEnd, -364);
    } else {
      startDateKey = addDaysToDateKey(todayKey, -364);
      endDateKey = todayKey;
    }
  } else {
    startDateKey =
      params.range === 'rolling_365'
        ? addDaysToDateKey(todayKey, -364)
        : `${params.range}-01-01`;
    endDateKey =
      params.range === 'rolling_365' ? todayKey : `${params.range}-12-31`;
  }

  const startWeekday = weekdayOfDateKey(startDateKey);
  const leadingPad = (startWeekday - params.weekStartsOn + 7) % 7;
  const gridStartKey = addDaysToDateKey(startDateKey, -leadingPad);

  const endWeekday = weekdayOfDateKey(endDateKey);
  const trailingPad = (params.weekStartsOn + 6 - endWeekday + 7) % 7;
  const gridEndKey = addDaysToDateKey(endDateKey, trailingPad);

  const rawDays: Array<{
    dateKey: string;
    totalSeconds: number;
    logCount: number;
    inRange: boolean;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  const activeDurations: number[] = [];
  let totalSeconds = 0;
  let totalLogs = 0;
  let activeDays = 0;
  let longestStreakDays = 0;
  let runningStreak = 0;
  let bestDay: { dateKey: string; totalSeconds: number } | null = null;

  let cursor = gridStartKey;
  while (cursor <= gridEndKey) {
    const inRange = cursor >= startDateKey && cursor <= endDateKey;
    const isToday = cursor === todayKey;
    const isFuture = cursor > todayKey;
    const stats = inRange ? allDayMap.get(cursor) : undefined;
    const sec = stats?.totalSeconds ?? 0;
    const cnt = stats?.logCount ?? 0;

    if (inRange) {
      totalSeconds += sec;
      totalLogs += cnt;
      if (sec > 0) {
        activeDays += 1;
        activeDurations.push(sec);
        runningStreak += 1;
        if (runningStreak > longestStreakDays) {
          longestStreakDays = runningStreak;
        }
        if (!bestDay || sec > bestDay.totalSeconds) {
          bestDay = { dateKey: cursor, totalSeconds: sec };
        }
      } else {
        runningStreak = 0;
      }
    }

    rawDays.push({
      dateKey: cursor,
      totalSeconds: sec,
      logCount: cnt,
      inRange,
      isToday,
      isFuture,
    });

    cursor = addDaysToDateKey(cursor, 1);
  }

  activeDurations.sort((a, b) => a - b);
  const p90Seconds =
    activeDurations.length > 0
      ? (activeDurations[Math.floor(0.9 * (activeDurations.length - 1))] ?? 0)
      : 0;

  const weeks: HeatmapDayCell[][] = [];
  for (let i = 0; i < rawDays.length; i += 7) {
    const weekSlice = rawDays.slice(i, i + 7).map((d) => ({
      ...d,
      level: d.inRange ? computeHeatmapIntensityLevel(d.totalSeconds, p90Seconds) : (0 as const),
    }));
    weeks.push(weekSlice);
  }

  const monthLabels: HeatmapMonthLabel[] = [];
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    const week = weeks[weekIndex]!;
    const firstOfMonth = week.find((cell) => cell.inRange && cell.dateKey.endsWith('-01'));
    const anchor = firstOfMonth ?? (weekIndex === 0 ? week.find((cell) => cell.inRange) : undefined);
    if (!anchor) continue;

    const year = Number(anchor.dateKey.slice(0, 4));
    const monthIndex = Number(anchor.dateKey.slice(5, 7)) - 1;
    const prev = monthLabels[monthLabels.length - 1];
    if (prev && weekIndex - prev.weekIndex < 2) {
      if (prev.weekIndex === 0) {
        monthLabels.pop();
      } else {
        continue;
      }
    }
    monthLabels.push({ weekIndex, monthIndex, year });
  }

  let currentStreakDays = 0;
  let streakCursor =
    (allDayMap.get(todayKey)?.totalSeconds ?? 0) > 0
      ? todayKey
      : addDaysToDateKey(todayKey, -1);
  while ((allDayMap.get(streakCursor)?.totalSeconds ?? 0) > 0) {
    currentStreakDays += 1;
    streakCursor = addDaysToDateKey(streakCursor, -1);
  }

  const weekdayOrder = Array.from({ length: 7 }, (_, idx) => (params.weekStartsOn + idx) % 7);

  return {
    range: params.range,
    startDateKey,
    endDateKey,
    weeks,
    weekdayOrder,
    monthLabels,
    p90Seconds,
    summary: {
      totalSeconds,
      totalLogs,
      activeDays,
      longestStreakDays,
      currentStreakDays,
      bestDay,
    },
  };
}
