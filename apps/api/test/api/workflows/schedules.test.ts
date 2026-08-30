import { dueInstants, zonesFor } from '@buzzkit/api/api/scheduling/index';
import { nextFires } from '@buzzkit/api/api/workflows/schedules';
import { describe, expect, it } from 'vitest';

const iso = (date: Date) => date.toISOString();

describe('dueInstants', () => {
  it('lists the fires inside the lookback and nothing in the future', () => {
    const now = new Date('2026-08-29T19:00:30.000Z');
    const lookback = 10 * 60_000;
    expect(dueInstants({ daily: '19:00' }, 'UTC', now, lookback, 20).map(iso)).toEqual([
      '2026-08-29T19:00:00.000Z',
    ]);
    expect(dueInstants({ daily: '19:01' }, 'UTC', now, lookback, 20)).toEqual([]);
    expect(dueInstants({ daily: '18:55' }, 'UTC', now, lookback, 20).map(iso)).toEqual([
      '2026-08-29T18:55:00.000Z',
    ]);
    expect(dueInstants({ daily: '18:49' }, 'UTC', now, lookback, 20)).toEqual([]);
    expect(dueInstants({ cron: '* * * * *' }, 'UTC', now, 3 * 60_000, 20).map(iso)).toEqual([
      '2026-08-29T18:58:00.000Z',
      '2026-08-29T18:59:00.000Z',
      '2026-08-29T19:00:00.000Z',
    ]);
    expect(dueInstants({ daily: '21:00' }, 'Europe/Berlin', now, lookback, 20).map(iso)).toEqual([
      '2026-08-29T19:00:00.000Z',
    ]);
  });
});

describe('nextFires', () => {
  it('lists the next fire per zone, soonest first', () => {
    const now = new Date('2026-08-29T19:00:30.000Z');
    const fixed = nextFires({ schedule: { daily: '19:00' }, timezone: 'UTC' }, now);
    expect(fixed).toEqual([{ zone: 'UTC', at: new Date('2026-08-30T19:00:00.000Z') }]);
    const everyone = nextFires({ schedule: { daily: '19:00' }, timezone: 'subscriber' }, now);
    expect(everyone).toHaveLength(10);
    const times = everyone.map((fire) => fire.at.getTime());
    expect([...times].sort((left, right) => left - right)).toEqual(times);
    expect(zonesFor('subscriber').length).toBeGreaterThan(100);
    expect(zonesFor('Asia/Tokyo')).toEqual(['Asia/Tokyo']);
  });
});
