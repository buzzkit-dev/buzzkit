import { env } from 'cloudflare:workers';
import type { ActorEventRow } from '@buzzkit/api/actor/types';
import { batchDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { appendEvents } from '@buzzkit/api/libs/tinybird';
import {
  type EventsQueueMessage,
  handleEventsBatch,
  handleEventsDeadLetterBatch,
  listWorkspaceIds,
  resolveEventRow,
} from '@buzzkit/api/queue/events';
import type { Db } from '@buzzkit/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/database', () => ({ createDb: vi.fn(), batchDb: vi.fn() }));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/tinybird', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appendEvents: vi.fn(),
}));
const span = vi.hoisted(() => ({ set: vi.fn(), trace: vi.fn() }));

vi.mock('@buzzkit/api/libs/telemetry', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trace: vi.fn((_name: string, attributesOrFn: unknown, maybeFn?: unknown) => {
    const fn = (typeof attributesOrFn === 'function' ? attributesOrFn : maybeFn) as (t: unknown) => unknown;
    return fn(span);
  }),
}));

const bindings = env as unknown as Record<string, unknown>;
const send = vi.fn();

function stubDb(rows: Array<{ id: number; workspaceId: number }>) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as Db, select, from, where };
}

const actorRow = (sequence: number, overrides: Partial<ActorEventRow> = {}): ActorEventRow => ({
  sequence,
  id: `evt_${sequence}`,
  idempotency_key: null,
  name: 'order.paid',
  source: 'server',
  timestamp: '2026-08-27T12:00:00.123Z',
  received_at: '2026-08-27T12:00:01.456Z',
  data: '{"total":42,"items":[1,[2,3],{"deep":[null]}]}',
  run_id: null,
  message_id: null,
  step: null,
  ...overrides,
});

const queueMessage = (tenantId: number, subscriberId: number, rows: ActorEventRow[]): EventsQueueMessage => ({
  tenantId,
  subscriberId,
  externalId: `user_${subscriberId}`,
  rows,
});

function stubBatch(bodies: EventsQueueMessage[]) {
  const messages = bodies.map((body, index) => ({
    id: `m${index}`,
    timestamp: new Date('2026-08-27T12:00:00Z'),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  const batch = { queue: 'buzzkit-events', messages, ackAll: vi.fn(), retryAll: vi.fn() };
  return {
    batch: batch as unknown as MessageBatch<EventsQueueMessage>,
    messages,
    ackAll: batch.ackAll,
    retryAll: batch.retryAll,
  };
}

beforeEach(() => {
  Object.assign(bindings, { EVENTS: { send } });
});

afterEach(() => {
  delete bindings.EVENTS;
  send.mockReset();
  vi.mocked(batchDb).mockReset();
  vi.mocked(appendEvents).mockReset();
  vi.mocked(log.error).mockReset();
  vi.mocked(span.set).mockReset();
});

describe('resolveEventRow', () => {
  it('maps every column, parses data and keeps the raw JSON verbatim', () => {
    const message = queueMessage(3, 7, []);
    const row = actorRow(5, {
      run_id: 'run_1',
      message_id: 'msg_1',
      step: 'welcome',
      idempotency_key: 'client-1',
    });
    expect(resolveEventRow(message, row, 11)).toEqual({
      workspace_id: 11,
      tenant_id: 3,
      subscriber_id: 7,
      external_id: 'user_7',
      id: 'evt_5',
      sequence: 5,
      name: 'order.paid',
      source: 'server',
      timestamp: '2026-08-27 12:00:00.123',
      received_at: '2026-08-27 12:00:01.456',
      data: { total: 42, items: [1, [2, 3], { deep: [null] }] },
      data_raw: '{"total":42,"items":[1,[2,3],{"deep":[null]}]}',
      run_id: 'run_1',
      message_id: 'msg_1',
      step: 'welcome',
    });
  });

  it('passes nulls through and drops the idempotency key', () => {
    const resolved = resolveEventRow(queueMessage(3, 7, []), actorRow(1), 0);
    expect(resolved).toMatchObject({ workspace_id: 0, run_id: null, message_id: null, step: null });
    expect('idempotency_key' in resolved).toBe(false);
  });
});

describe('listWorkspaceIds', () => {
  it('skips the query for an empty list', async () => {
    const { db, select } = stubDb([]);
    await expect(listWorkspaceIds(db, [])).resolves.toEqual(new Map());
    expect(select).not.toHaveBeenCalled();
  });

  it('maps tenant ids to workspace ids from the rows', async () => {
    const { db, select, from, where } = stubDb([
      { id: 3, workspaceId: 11 },
      { id: 4, workspaceId: 12 },
    ]);
    await expect(listWorkspaceIds(db, [3, 4, 5])).resolves.toEqual(
      new Map([
        [3, 11],
        [4, 12],
      ])
    );
    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe('handleEventsBatch', () => {
  it('forwards every row of every message in one append and acks the batch', async () => {
    const { db } = stubDb([
      { id: 3, workspaceId: 11 },
      { id: 4, workspaceId: 12 },
    ]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents).mockResolvedValue({ successful: 4, quarantined: 0 });
    const { batch, messages, ackAll, retryAll } = stubBatch([
      queueMessage(3, 7, [actorRow(1), actorRow(2)]),
      queueMessage(4, 8, [actorRow(1)]),
      queueMessage(3, 9, [actorRow(1)]),
    ]);

    await handleEventsBatch(batch);

    expect(batchDb).toHaveBeenCalledWith();
    expect(appendEvents).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(appendEvents).mock.calls[0]![0];
    expect(
      rows.map((row) => [row.workspace_id, row.tenant_id, row.subscriber_id, row.external_id, row.sequence])
    ).toEqual([
      [11, 3, 7, 'user_7', 1],
      [11, 3, 7, 'user_7', 2],
      [12, 4, 8, 'user_8', 1],
      [11, 3, 9, 'user_9', 1],
    ]);
    expect(ackAll).toHaveBeenCalledTimes(1);
    expect(retryAll).not.toHaveBeenCalled();
    expect(
      messages.every(
        (message) => message.ack.mock.calls.length === 0 && message.retry.mock.calls.length === 0
      )
    ).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
    expect(span.set).toHaveBeenCalledWith('queue.rows', 4);
    expect(span.set).toHaveBeenCalledWith('tinybird.committed', 4);
    expect(span.set).toHaveBeenCalledWith('tinybird.quarantined', 0);
  });

  it('re-posts each message on its own to find the quarantined subscriber, then acks', async () => {
    const { db } = stubDb([{ id: 3, workspaceId: 11 }]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents)
      .mockResolvedValueOnce({ successful: 2, quarantined: 1 })
      .mockResolvedValueOnce({ successful: 2, quarantined: 0 })
      .mockResolvedValueOnce({ successful: 0, quarantined: 1 });
    const { batch, ackAll, retryAll } = stubBatch([
      queueMessage(3, 7, [actorRow(1), actorRow(2)]),
      queueMessage(3, 8, [actorRow(5)]),
    ]);

    await handleEventsBatch(batch);

    expect(appendEvents).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(appendEvents).mock.calls;
    expect(calls[0]![0].map((row) => [row.subscriber_id, row.sequence])).toEqual([
      [7, 1],
      [7, 2],
      [8, 5],
    ]);
    expect(calls[1]![0].map((row) => [row.subscriber_id, row.sequence, row.workspace_id])).toEqual([
      [7, 1, 11],
      [7, 2, 11],
    ]);
    expect(calls[2]![0].map((row) => [row.subscriber_id, row.sequence, row.workspace_id])).toEqual([
      [8, 5, 11],
    ]);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[Events] Tinybird quarantined rows of one subscriber', {
      tenantId: 3,
      subscriberId: 8,
      rows: 1,
      fromSequence: 5,
      toSequence: 5,
      quarantined: 1,
    });
    expect(span.set).toHaveBeenCalledWith('tinybird.quarantined', 1);
    expect(ackAll).toHaveBeenCalledTimes(1);
    expect(retryAll).not.toHaveBeenCalled();
  });

  it('logs a lone quarantined message without re-posting it', async () => {
    const { db } = stubDb([{ id: 3, workspaceId: 11 }]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents).mockResolvedValueOnce({ successful: 1, quarantined: 2 });
    const { batch, ackAll, retryAll } = stubBatch([
      queueMessage(3, 7, [actorRow(4), actorRow(5), actorRow(6)]),
    ]);

    await handleEventsBatch(batch);

    expect(appendEvents).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[Events] Tinybird quarantined rows of one subscriber', {
      tenantId: 3,
      subscriberId: 7,
      rows: 3,
      fromSequence: 4,
      toSequence: 6,
      quarantined: 3,
    });
    expect(ackAll).toHaveBeenCalledTimes(1);
    expect(retryAll).not.toHaveBeenCalled();
  });

  it('retries the batch when the isolating re-post itself fails', async () => {
    const { db } = stubDb([{ id: 3, workspaceId: 11 }]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents)
      .mockResolvedValueOnce({ successful: 1, quarantined: 1 })
      .mockRejectedValueOnce(new Error('Tinybird did not commit the batch: 503'));
    const { batch, ackAll, retryAll } = stubBatch([
      queueMessage(3, 7, [actorRow(1)]),
      queueMessage(3, 8, [actorRow(1)]),
    ]);

    await handleEventsBatch(batch);

    expect(retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(ackAll).not.toHaveBeenCalled();
  });

  it('resolves an unknown tenant to workspace 0', async () => {
    const { db } = stubDb([{ id: 3, workspaceId: 11 }]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents).mockResolvedValue({ successful: 2, quarantined: 0 });
    const { batch } = stubBatch([queueMessage(3, 7, [actorRow(1)]), queueMessage(99, 8, [actorRow(1)])]);

    await handleEventsBatch(batch);

    const rows = vi.mocked(appendEvents).mock.calls[0]![0];
    expect(rows.map((row) => row.workspace_id)).toEqual([11, 0]);
  });

  it('retries the whole batch after thirty seconds and never acks when the append fails', async () => {
    const { db } = stubDb([{ id: 3, workspaceId: 11 }]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents).mockRejectedValue(new Error('Tinybird did not commit the batch: 503'));
    const { batch, messages, ackAll, retryAll } = stubBatch([
      queueMessage(3, 7, [actorRow(1)]),
      queueMessage(3, 8, [actorRow(1)]),
    ]);

    await expect(handleEventsBatch(batch)).resolves.toBeUndefined();

    expect(retryAll).toHaveBeenCalledTimes(1);
    expect(retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(ackAll).not.toHaveBeenCalled();
    expect(messages.every((message) => message.ack.mock.calls.length === 0)).toBe(true);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.error).mock.calls[0]![1]).toMatchObject({
      rows: 2,
      error: expect.stringContaining('503'),
    });
  });

  it('acks an empty batch without appending anything', async () => {
    const { db, select } = stubDb([]);
    vi.mocked(batchDb).mockReturnValue(db);
    vi.mocked(appendEvents).mockResolvedValue({ successful: 0, quarantined: 0 });
    const { batch, ackAll } = stubBatch([]);

    await handleEventsBatch(batch);

    expect(select).not.toHaveBeenCalled();
    expect(appendEvents).toHaveBeenCalledWith([]);
    expect(ackAll).toHaveBeenCalledTimes(1);
  });
});

describe('handleEventsDeadLetterBatch', () => {
  it('re-sends every message body to the events queue with a ten minute delay and acks each', async () => {
    const bodies = [queueMessage(3, 7, [actorRow(1), actorRow(2)]), queueMessage(4, 8, [actorRow(5)])];
    const { batch, messages } = stubBatch(bodies);

    await handleEventsDeadLetterBatch(batch);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls).toEqual([
      [{ ...bodies[0], firstFailedAt: expect.any(String) }, { delaySeconds: 600 }],
      [{ ...bodies[1], firstFailedAt: expect.any(String) }, { delaySeconds: 600 }],
    ]);
    const stamped = (send.mock.calls[0]![0] as { firstFailedAt: string }).firstFailedAt;
    expect(Date.now() - new Date(stamped).getTime()).toBeLessThan(5_000);
    for (const message of messages) {
      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(message.retry).not.toHaveBeenCalled();
    }
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(vi.mocked(log.error).mock.calls[0]![1]).toEqual({
      tenantId: 3,
      subscriberId: 7,
      rows: 2,
      fromSequence: 1,
      toSequence: 2,
      firstFailedAt: stamped,
    });
  });

  it('keeps the original first failure time across re-drives', async () => {
    const firstFailedAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { batch, messages } = stubBatch([{ ...queueMessage(3, 7, [actorRow(1)]), firstFailedAt }]);

    await handleEventsDeadLetterBatch(batch);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ firstFailedAt }), { delaySeconds: 600 });
    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
  });

  it('drops a batch that first failed more than seven days ago, with a final error log', async () => {
    const firstFailedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { batch, messages } = stubBatch([
      { ...queueMessage(3, 7, [actorRow(1), actorRow(2)]), firstFailedAt },
      queueMessage(4, 8, [actorRow(5)]),
    ]);

    await handleEventsDeadLetterBatch(batch);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ tenantId: 4, subscriberId: 8 });
    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[0]!.retry).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('[Events] Batch failed for seven days, dropping it', {
      tenantId: 3,
      subscriberId: 7,
      rows: 2,
      fromSequence: 1,
      toSequence: 2,
      firstFailedAt,
    });
  });

  it('retries a message whose re-send fails and still re-drives the others', async () => {
    const bodies = [queueMessage(3, 7, [actorRow(1)]), queueMessage(4, 8, [actorRow(2)])];
    send.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValueOnce(undefined);
    const { batch, messages } = stubBatch(bodies);

    await handleEventsDeadLetterBatch(batch);

    expect(send).toHaveBeenCalledTimes(2);
    expect(messages[0]!.ack).not.toHaveBeenCalled();
    expect(messages[0]!.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(messages[1]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[1]!.retry).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith('[Events] Could not re-drive a batch, retrying', {
      tenantId: 3,
      subscriberId: 7,
      rows: 1,
      fromSequence: 1,
      toSequence: 1,
      error: 'queue unavailable',
    });
    expect(log.error).toHaveBeenCalledWith('[Events] Batch exhausted its retries, re-driving it', {
      tenantId: 4,
      subscriberId: 8,
      rows: 1,
      fromSequence: 2,
      toSequence: 2,
      firstFailedAt: expect.any(String),
    });
  });

  it('logs null sequences for a message without rows and still re-sends it', async () => {
    const { batch, messages } = stubBatch([queueMessage(3, 7, [])]);

    await handleEventsDeadLetterBatch(batch);

    expect(send).toHaveBeenCalledTimes(1);
    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.error).mock.calls[0]![1]).toMatchObject({
      rows: 0,
      fromSequence: null,
      toSequence: null,
    });
  });

  it('does nothing for an empty batch', async () => {
    const { batch } = stubBatch([]);
    await handleEventsDeadLetterBatch(batch);
    expect(send).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
});
