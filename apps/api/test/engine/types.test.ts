import { toWaitPayload } from '@buzzkit/api/engine/types';
import { describe, expect, it } from 'vitest';

describe('toWaitPayload', () => {
  it('serializes an actor event into the wait payload shape', () => {
    expect(
      toWaitPayload({
        id: 'evt_1',
        name: 'order.paid',
        data: { total: 42 },
        source: 'server',
        timestamp: '2026-09-01T12:00:00.000Z',
        receivedAt: '2026-09-01T12:00:01.000Z',
      } as never)
    ).toEqual({
      name: 'order.paid',
      dataJson: '{"total":42}',
      timestamp: '2026-09-01T12:00:00.000Z',
      id: 'evt_1',
    });
  });
});
