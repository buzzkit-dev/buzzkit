import {
  EARLIEST_ZONE,
  followsSubscriber,
  isKnownTimezone,
  isWallClock,
  LATEST_ZONE,
  listTimezones,
  timezoneScoped,
  wallTimeToInstant,
  zonesFor,
} from '@buzzkit/api/api/scheduling/index';
import { localTime } from '@buzzkit/api/libs/timezone';
import { describe, expect, it } from 'vitest';

describe('wallTimeToInstant', () => {
  it('converts a wall-clock time in a zone to the instant, across DST', () => {
    expect(wallTimeToInstant('2026-01-15T10:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-01-15T09:00:00.000Z'
    );
    expect(wallTimeToInstant('2026-07-15T10:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-07-15T08:00:00.000Z'
    );
    expect(wallTimeToInstant('2026-07-15T10:00', 'UTC').toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect(localTime(new Date('2026-07-15T08:00:00Z'), 'Europe/Berlin')).toMatchObject({
      hour: 10,
      minute: 0,
    });
  });
});

describe('wallTimeToInstant across DST edges', () => {
  it('lands within the hour for a time that does not exist and picks one of an ambiguous time', () => {
    const skipped = wallTimeToInstant('2026-03-29T02:30', 'Europe/Berlin');
    expect(Math.abs(skipped.getTime() - Date.UTC(2026, 2, 29, 1, 30))).toBeLessThanOrEqual(60 * 60_000);
    const ambiguous = wallTimeToInstant('2026-10-25T02:30', 'Europe/Berlin');
    expect([Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)]).toContain(ambiguous.getTime());
    expect(
      localTime(wallTimeToInstant('2026-06-01T09:00', 'America/New_York'), 'America/New_York')
    ).toMatchObject({
      hour: 9,
      minute: 0,
    });
  });
});

describe('timezoneScoped', () => {
  it('scopes an audience to the due zones and folds unknown zones into the fallback', () => {
    const audience = { ref: 'attributes.plan', eq: 'pro' } as const;
    expect(timezoneScoped(audience, ['Europe/Berlin'], 'UTC')).toEqual({
      all: [audience, { ref: 'attributes.$timezone', in: ['Europe/Berlin'] }],
    });
    expect(timezoneScoped(audience, ['UTC'], 'UTC')).toEqual({
      all: [
        audience,
        {
          any: [
            { ref: 'attributes.$timezone', in: ['UTC'] },
            { ref: 'attributes.$timezone', exists: false },
          ],
        },
      ],
    });
  });
});

describe('zones', () => {
  it('spans every zone for subscriber schedules and one for a fixed zone', () => {
    expect(followsSubscriber('subscriber')).toBe(true);
    expect(followsSubscriber('Europe/Berlin')).toBe(false);
    expect(zonesFor('subscriber')).toEqual(listTimezones());
    expect(zonesFor('Asia/Tokyo')).toEqual(['Asia/Tokyo']);
    expect(listTimezones()).toContain('UTC');
    expect(listTimezones().length).toBeGreaterThan(300);
  });

  it('knows the subscriber sentinel and real zones, and nothing else', () => {
    expect(isKnownTimezone('subscriber')).toBe(true);
    expect(isKnownTimezone('Europe/Berlin')).toBe(true);
    expect(isKnownTimezone('Mars/Olympus')).toBe(false);
  });

  it('brackets a subscriber wall-clock time between the earliest and latest zones on earth', () => {
    const first = wallTimeToInstant('2026-07-15T10:00', EARLIEST_ZONE).getTime();
    const last = wallTimeToInstant('2026-07-15T10:00', LATEST_ZONE).getTime();
    expect(last - first).toBe(26 * 3_600_000);
    for (const zone of listTimezones()) {
      const at = wallTimeToInstant('2026-07-15T10:00', zone).getTime();
      expect(at, zone).toBeGreaterThanOrEqual(first);
      expect(at, zone).toBeLessThanOrEqual(last);
    }
  });

  it('accepts only real calendar wall-clock times', () => {
    expect(isWallClock('2026-07-16T10:00')).toBe(true);
    for (const bad of [
      '2026-07-16 10:00',
      '2026-02-30T10:00',
      '2026-07-16T24:00',
      '2026-13-01T10:00',
      '10:00',
    ]) {
      expect(isWallClock(bad), bad).toBe(false);
    }
  });
});
