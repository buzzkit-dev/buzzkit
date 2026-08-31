import { wallClock } from '@buzzkit/api/libs/timezone';
import { describe, expect, it } from 'vitest';

describe('wallClock', () => {
  it('formats an instant as the wall-clock time of the zone', () => {
    const instant = new Date('2026-09-01T17:00:00.000Z');
    expect(wallClock(instant, 'Europe/Berlin')).toBe('2026-09-01T19:00:00');
    expect(wallClock(instant, 'UTC')).toBe('2026-09-01T17:00:00');
    expect(wallClock(instant, 'America/New_York')).toBe('2026-09-01T13:00:00');
  });

  it('pads single digits', () => {
    const instant = new Date('2026-01-05T04:05:00.000Z');
    expect(wallClock(instant, 'UTC')).toBe('2026-01-05T04:05:00');
  });
});
