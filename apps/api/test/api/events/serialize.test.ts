import { serializeEvent, serializeEventName } from '@buzzkit/api/api/events/serialize';
import type { EventNameRow, EventRow } from '@buzzkit/api/api/events/types';
import { describe, expect, it } from 'vitest';

const row: EventRow = {
  id: 'evt_1',
  sequence: 12,
  name: '$app.opened',
  source: 'ios',
  external_id: 'user_a',
  timestamp: '2026-08-27 12:00:00.123',
  received_at: '2026-08-27 12:00:01.456',
  data: '{"plan":"pro","items":[1,{"deep":true}],"nothing":null}',
  run_id: 'run_1',
  message_id: 'msg_1',
  step: 'welcome',
};

describe('serializeEvent', () => {
  it('parses the data column and converts ClickHouse times to ISO', () => {
    expect(serializeEvent(row)).toEqual({
      id: 'evt_1',
      sequence: 12,
      name: '$app.opened',
      source: 'ios',
      externalId: 'user_a',
      timestamp: '2026-08-27T12:00:00.123Z',
      receivedAt: '2026-08-27T12:00:01.456Z',
      data: { plan: 'pro', items: [1, { deep: true }], nothing: null },
      runId: 'run_1',
      messageId: 'msg_1',
      step: 'welcome',
    });
  });

  it('nulls a missing external id and passes null references through', () => {
    const { external_id, ...withoutExternalId } = row;
    expect(external_id).toBe('user_a');
    expect(
      serializeEvent({ ...withoutExternalId, data: '{}', run_id: null, message_id: null, step: null })
    ).toMatchObject({
      externalId: null,
      data: {},
      runId: null,
      messageId: null,
      step: null,
    });
  });

  it('accepts second precision and ISO timestamps from the row', () => {
    expect(
      serializeEvent({ ...row, timestamp: '2026-08-27 12:00:00', received_at: '2026-08-27T12:00:00Z' })
    ).toMatchObject({ timestamp: '2026-08-27T12:00:00.000Z', receivedAt: '2026-08-27T12:00:00.000Z' });
  });
});

describe('serializeEventName', () => {
  it('maps the counts, sources and time range', () => {
    const nameRow: EventNameRow = {
      name: 'order.paid',
      count_24h: 1,
      count_7d: 2,
      count_30d: 3,
      count_total: 4,
      subscribers_7d: 5,
      sources: ['server', 'ios'],
      last_at: '2026-08-27 12:00:00.999',
      first_at: '2026-08-01 00:00:00',
    };
    expect(serializeEventName(nameRow)).toEqual({
      name: 'order.paid',
      counts: { last24h: 1, last7d: 2, last30d: 3, total: 4 },
      subscribers7d: 5,
      sources: ['server', 'ios'],
      lastAt: '2026-08-27T12:00:00.999Z',
      firstAt: '2026-08-01T00:00:00.000Z',
    });
  });
});
