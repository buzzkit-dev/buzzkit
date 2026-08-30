import { nextScheduleInstant } from '@buzzkit/api/api/scheduling/index';
import { describe, expect, it } from 'vitest';

describe('nextScheduleInstant', () => {
  it('finds the next local fire time, across DST and month ends', () => {
    const after = new Date('2026-03-28T12:00:00Z');
    expect(nextScheduleInstant({ daily: '09:00' }, after, 'Europe/Berlin')?.toISOString()).toBe(
      '2026-03-29T07:00:00.000Z'
    );
    expect(nextScheduleInstant({ cron: '0 10 * * MON' }, after, 'America/New_York')?.toISOString()).toBe(
      '2026-03-30T14:00:00.000Z'
    );
    expect(
      nextScheduleInstant({ cron: '0 0 31 * *' }, new Date('2026-02-01T00:00:00Z'), 'UTC')?.toISOString()
    ).toBe('2026-03-31T00:00:00.000Z');
    expect(nextScheduleInstant({ cron: '0 12 * * *' }, after, 'UTC')?.toISOString()).toBe(
      '2026-03-29T12:00:00.000Z'
    );
    expect(nextScheduleInstant({ cron: '30 12 * * *' }, after, 'UTC')?.toISOString()).toBe(
      '2026-03-28T12:30:00.000Z'
    );
    expect(nextScheduleInstant({ cron: '0 0 30 2 *' }, after, 'UTC')).toBeNull();
  });
});
