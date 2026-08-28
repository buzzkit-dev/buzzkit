import {
  dueZones,
  firstInstant,
  lastInstant,
  listTimezones,
  localTime,
  resolveSchedule,
  timezoneScoped,
  wallTimeToInstant,
} from '@buzzkit/api/api/messages/schedule';
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

describe('resolveSchedule', () => {
  const now = new Date('2026-07-15T12:00:00Z');

  it('accepts a fixed zone, defaults to UTC and spans the world for subscriber schedules', () => {
    const fixed = resolveSchedule({ at: '2026-07-16T10:00', timezone: 'Europe/Berlin' }, now);
    expect(fixed).toEqual({ at: '2026-07-16T10:00', timezone: 'Europe/Berlin' });
    expect(firstInstant(fixed)).toEqual(lastInstant(fixed));
    expect(resolveSchedule({ at: '2026-07-16T10:00' }, now).timezone).toBe('UTC');

    const local = resolveSchedule({ at: '2026-07-16T10:00', timezone: 'subscriber' }, now);
    expect(local.defaultTimezone).toBe('UTC');
    expect(firstInstant(local).toISOString()).toBe('2026-07-15T20:00:00.000Z');
    expect(lastInstant(local).toISOString()).toBe('2026-07-16T22:00:00.000Z');
  });

  it('refuses the past, unknown zones and a stray default timezone', () => {
    expect(() => resolveSchedule({ at: '2026-07-15T11:00', timezone: 'UTC' }, now)).toThrow(/past/);
    expect(() => resolveSchedule({ at: '2026-07-14T10:00', timezone: 'subscriber' }, now)).toThrow(/past/);
    expect(resolveSchedule({ at: '2026-07-15T02:00', timezone: 'subscriber' }, now).at).toBe(
      '2026-07-15T02:00'
    );
    expect(() => resolveSchedule({ at: '2026-07-16T10:00', timezone: 'Mars/Olympus' }, now)).toThrow(
      /timezone/
    );
    expect(() =>
      resolveSchedule({ at: '2026-07-16T10:00', timezone: 'UTC', defaultTimezone: 'UTC' }, now)
    ).toThrow(/defaultTimezone/);
    expect(() => resolveSchedule({ at: '2026-07-16 10:00' }, now)).toThrow(/wall-clock/);
    expect(() => resolveSchedule({ at: '2026-02-30T10:00' }, now)).toThrow(/wall-clock/);
    expect(() => resolveSchedule({ at: '2026-07-16T24:00' }, now)).toThrow(/wall-clock/);
    expect(() => resolveSchedule({ at: '2026-13-01T10:00' }, now)).toThrow(/wall-clock/);
  });
});

describe('dueZones', () => {
  it('lists the zones whose clock has passed the moment and skips the ones already released', () => {
    const schedule = { at: '2026-07-15T10:00', timezone: 'subscriber', defaultTimezone: 'UTC' };
    const berlinDue = new Date('2026-07-15T08:00:30Z');
    const due = dueZones(schedule, berlinDue, []);
    expect(due).toContain('Europe/Berlin');
    expect(due).not.toContain('America/New_York');
    expect(dueZones(schedule, berlinDue, ['Europe/Berlin'])).not.toContain('Europe/Berlin');
    expect(dueZones(schedule, new Date('2026-07-16T23:00:00Z'), []).length).toBe(listTimezones().length);
  });

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
