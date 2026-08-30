import { dueZones, firstInstant, lastInstant, resolveSchedule } from '@buzzkit/api/api/messages/schedule';
import { listTimezones } from '@buzzkit/api/api/scheduling/index';
import { describe, expect, it } from 'vitest';

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
});
