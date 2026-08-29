import { describeInstant, resolveAnchor } from '@buzzkit/api/engine/anchors';
import { describe, expect, it } from 'vitest';

const trigger = { timestamp: '2026-08-29T10:00:00.000Z' };

describe('resolveAnchor', () => {
  it('anchors to the trigger plus a duration', () => {
    expect(resolveAnchor({ after: 'trigger', plus: '2h' }, trigger, {})).toBe(
      Date.parse('2026-08-29T12:00:00.000Z')
    );
    expect(resolveAnchor({ after: 'trigger' }, trigger, {})).toBe(Date.parse(trigger.timestamp));
  });

  it('anchors to the moment a step ended, falling back to the trigger for a step that did not run', () => {
    const steps = { settle: { at: '2026-08-30T00:00:00.000Z' } };
    expect(resolveAnchor({ after: 'steps.settle', plus: '1d' }, trigger, steps)).toBe(
      Date.parse('2026-08-31T00:00:00.000Z')
    );
    expect(resolveAnchor({ after: 'steps.missing', plus: '1d' }, trigger, {})).toBe(
      Date.parse('2026-08-30T10:00:00.000Z')
    );
  });

  it('snaps to a wall-clock time in a zone, rolling to the next day when that time already passed', () => {
    expect(resolveAnchor({ after: 'trigger', at: '18:00', timezone: 'Europe/Paris' }, trigger, {})).toBe(
      Date.parse('2026-08-29T16:00:00.000Z')
    );
    expect(resolveAnchor({ after: 'trigger', at: '09:00', timezone: 'Europe/Paris' }, trigger, {})).toBe(
      Date.parse('2026-08-30T07:00:00.000Z')
    );
    expect(
      resolveAnchor({ after: 'trigger', plus: '3d', at: '09:00', timezone: 'America/New_York' }, trigger, {})
    ).toBe(Date.parse('2026-09-01T13:00:00.000Z'));
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
