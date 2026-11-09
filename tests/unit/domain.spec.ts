import { describe, expect, it } from 'vitest';
import {
  elapsedSeconds,
  formatHMS,
  normalizeDescription,
  parseHMS,
  toDateKey,
} from '../../app/domain/duration';
import { deterministicLogId, generateRandomId } from '../../app/domain/ids';

describe('domain/duration', () => {
  it('calculates elapsedSeconds resiliently from UTC delta', () => {
    const start = '2026-11-09T05:00:00.000Z';
    const now = Date.parse('2026-11-09T06:01:05.900Z');
    expect(elapsedSeconds(start, now)).toBe(3665);
    expect(elapsedSeconds(start, Date.parse('2026-11-09T04:00:00.000Z'))).toBe(0);
    expect(elapsedSeconds('invalid-date', now)).toBe(0);
  });

  it('formats and parses HH:MM:SS losslessly', () => {
    expect(formatHMS(0)).toBe('00:00:00');
    expect(formatHMS(3665)).toBe('01:01:05');
    expect(formatHMS(360000)).toBe('100:00:00');
    expect(parseHMS('01:01:05')).toBe(3665);
    expect(parseHMS('100:00:00')).toBe(360000);
    expect(parseHMS('05:30')).toBe(330);
    expect(parseHMS('01:99:00')).toBeNull();
  });

  it('computes toDateKey in the user preferred IANA timezone across midnight boundaries', () => {
    // 2026-11-09 01:30 UTC is still 2026-11-08 22:30 in America/Sao_Paulo (UTC-3)
    const utc = '2026-11-09T01:30:00.000Z';
    expect(toDateKey(utc, 'UTC')).toBe('2026-11-09');
    expect(toDateKey(utc, 'America/Sao_Paulo')).toBe('2026-11-08');
    expect(toDateKey(utc, 'Asia/Tokyo')).toBe('2026-11-09');
  });

  it('normalizes descriptions consistently for recall templates', () => {
    expect(normalizeDescription('  Review   PR #42  ')).toBe('review pr #42');
  });
});

describe('domain/ids', () => {
  it('generates 20-char random alphanumeric IDs', () => {
    const a = generateRandomId();
    const b = generateRandomId();
    expect(a).toHaveLength(20);
    expect(b).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it('generates deterministic SHA-256 IDs for identical CSV import rows', async () => {
    const key = {
      startTimeUTC: '2026-11-09T12:00:00.000Z',
      durationSeconds: 1800,
      normalizedDescription: 'daily standup',
      projectName: 'XP Core API',
    };
    const id1 = await deterministicLogId(key);
    const id2 = await deterministicLogId({ ...key, projectName: '  xp core api ' });
    const id3 = await deterministicLogId({ ...key, durationSeconds: 1801 });

    expect(id1).toHaveLength(22);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});
