import { localInstant, localMidnight, localTime, nextLocalTime } from '@buzzkit/api/libs/timezone';
import { describe, expect, it } from 'vitest';

describe('timezone', () => {
  it('converts between instants and local wall time, DST included', () => {
    const instant = new Date('2026-07-01T07:30:00Z');
    expect(localTime(instant, 'Europe/Berlin')).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 9,
      minute: 30,
    });
    expect(localTime(instant, 'America/Los_Angeles')).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 0,
      minute: 30,
    });
    expect(
      localInstant({ year: 2026, month: 7, day: 1, hour: 9, minute: 30 }, 'Europe/Berlin').toISOString()
    ).toBe('2026-07-01T07:30:00.000Z');
    expect(
      localInstant({ year: 2026, month: 1, day: 1, hour: 9, minute: 30 }, 'Europe/Berlin').toISOString()
    ).toBe('2026-01-01T08:30:00.000Z');
    expect(localMidnight(instant, 'America/Los_Angeles').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(localMidnight(instant, 'Asia/Tokyo').toISOString()).toBe('2026-06-30T15:00:00.000Z');
  });
});

describe('nextLocalTime', () => {
  it('lands on the next occurrence of a wall-clock time in a zone', () => {
    const morning = new Date('2026-09-01T07:00:00Z');
    expect(nextLocalTime(morning, 10, 0, 'Europe/Berlin').toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(nextLocalTime(morning, 8, 30, 'Europe/Berlin').toISOString()).toBe('2026-09-02T06:30:00.000Z');
    expect(nextLocalTime(new Date('2026-09-01T08:00:00Z'), 10, 0, 'Europe/Berlin').toISOString()).toBe(
      '2026-09-01T08:00:00.000Z'
    );
    expect(nextLocalTime(new Date('2026-03-28T20:00:00Z'), 9, 0, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T07:00:00.000Z'
    );
    expect(nextLocalTime(new Date('2026-09-01T23:30:00Z'), 9, 0, 'Asia/Tokyo').toISOString()).toBe(
      '2026-09-02T00:00:00.000Z'
    );
  });
});
