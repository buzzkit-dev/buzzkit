import { describeInstant, resolveMoment } from '@buzzkit/api/engine/moments';
import { describe, expect, it } from 'vitest';

const trigger = { timestamp: '2026-08-29T10:00:00.000Z' };

const at = (moment: Parameters<typeof resolveMoment>[0], subscriberTimezone = 'UTC') =>
  resolveMoment(moment, trigger, subscriberTimezone).at;

describe('resolveMoment', () => {
  it('counts a delay from the start of the run', () => {
    expect(at({ delay: '2h' })).toBe(Date.parse('2026-08-29T12:00:00.000Z'));
    expect(resolveMoment({ delay: '2h' }, trigger, 'UTC').timezone).toBeNull();
  });

  it('snaps to a wall-clock time in a zone, rolling to the next day when that time already passed', () => {
    expect(at({ time: '18:00', timezone: 'Europe/Paris' })).toBe(Date.parse('2026-08-29T16:00:00.000Z'));
    expect(at({ time: '09:00', timezone: 'Europe/Paris' })).toBe(Date.parse('2026-08-30T07:00:00.000Z'));
    expect(at({ delay: '3d', time: '09:00', timezone: 'America/New_York' })).toBe(
      Date.parse('2026-09-01T13:00:00.000Z')
    );
  });

  it("reads the subscriber's own zone when the moment says so", () => {
    expect(resolveMoment({ time: '09:00', timezone: 'subscriber' }, trigger, 'Asia/Tokyo')).toEqual({
      at: Date.parse('2026-08-30T00:00:00.000Z'),
      timezone: 'Asia/Tokyo',
    });
  });
});

describe('describeInstant', () => {
  it('reads as a date and time in the zone', () => {
    expect(describeInstant(Date.parse('2026-09-01T07:00:00.000Z'), 'Europe/Paris')).toBe(
      'Sep 1, 2026, 9:00 AM Europe/Paris'
    );
    expect(describeInstant(Date.parse('2026-09-01T07:00:00.000Z'))).toBe('Sep 1, 2026, 7:00 AM UTC');
  });
});
