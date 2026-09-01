import { env } from 'cloudflare:workers';
import type { ActorEventRow } from '@buzzkit/api/actor/types';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import { DAY_MS } from '@buzzkit/api/libs/timezone';
import { appendEvents, type EventRow, formatClickHouseTime } from '@buzzkit/api/libs/tinybird';
import { CRASH_RETRY_DELAY_SECONDS, consume } from '@buzzkit/api/queue/consume';
import { type Db, inArray, tables } from '@buzzkit/database';

export type EventsQueueMessage = {
  tenantId: number;
  subscriberId: number;
  externalId: string;
  rows: ActorEventRow[];
  firstFailedAt?: string;
};

const REDRIVE_DELAY_SECONDS = 600;
const REDRIVE_WINDOW_MS = 7 * DAY_MS;

export async function listWorkspaceIds(db: Db, tenantIds: number[]): Promise<Map<number, number>> {
  if (tenantIds.length === 0) return new Map();
  const rows = await db
    .select({ id: tables.tenant.id, workspaceId: tables.tenant.workspaceId })
    .from(tables.tenant)
    .where(inArray(tables.tenant.id, tenantIds));
  return new Map(rows.map((row) => [row.id, row.workspaceId]));
}

export function resolveEventRow(
  message: EventsQueueMessage,
  row: ActorEventRow,
  workspaceId: number
): EventRow {
  return {
    workspace_id: workspaceId,
    tenant_id: message.tenantId,
    subscriber_id: message.subscriberId,
    external_id: message.externalId,
    id: row.id,
    sequence: row.sequence,
    name: row.name,
    source: row.source,
    timestamp: formatClickHouseTime(row.timestamp),
    received_at: formatClickHouseTime(row.received_at),
    data: JSON.parse(row.data) as Record<string, unknown>,
    data_raw: row.data,
    run_id: row.run_id,
    message_id: row.message_id,
    step: row.step,
  };
}

export async function handleEventsBatch(batch: MessageBatch<EventsQueueMessage>): Promise<void> {
  await consume('events.batch', batch, async (db, t) => {
    const workspaces = await listWorkspaceIds(db, [
      ...new Set(batch.messages.map((item) => item.body.tenantId)),
    ]);
    const rows = batch.messages.flatMap((item) =>
      item.body.rows.map((row) => resolveEventRow(item.body, row, workspaces.get(item.body.tenantId) ?? 0))
    );
    t.set('queue.rows', rows.length);

    try {
      const result = await appendEvents(rows);
      t.set('tinybird.committed', result.successful);
      t.set('tinybird.quarantined', result.quarantined);
      if (result.quarantined > 0) await isolateQuarantine(batch.messages, workspaces);
      batch.ackAll();
    } catch (error) {
      log.error('[Events] Tinybird did not commit the batch, retrying', {
        rows: rows.length,
        error: describeError(error),
      });
      batch.retryAll({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
    }
  });
}

async function isolateQuarantine(
  messages: readonly Message<EventsQueueMessage>[],
  workspaces: Map<number, number>
): Promise<void> {
  for (const item of messages) {
    const rows = item.body.rows.map((row) =>
      resolveEventRow(item.body, row, workspaces.get(item.body.tenantId) ?? 0)
    );
    let quarantined = rows.length;
    if (messages.length > 1) {
      const result = await appendEvents(rows);
      quarantined = result.quarantined;
    }

    if (quarantined > 0) {
      log.error('[Events] Tinybird quarantined rows of one subscriber', {
        ...describeMessage(item.body),
        quarantined,
      });
    }
  }
}

function describeMessage(message: EventsQueueMessage) {
  return {
    tenantId: message.tenantId,
    subscriberId: message.subscriberId,
    rows: message.rows.length,
    fromSequence: message.rows[0]?.sequence ?? null,
    toSequence: message.rows.at(-1)?.sequence ?? null,
  };
}

export async function handleEventsDeadLetterBatch(batch: MessageBatch<EventsQueueMessage>): Promise<void> {
  await trace('queue.events.redrive', { 'queue.batch_size': batch.messages.length }, async (t) => {
    let rows = 0;
    for (const item of batch.messages) {
      rows += item.body.rows.length;
      const firstFailedAt = item.body.firstFailedAt ?? new Date().toISOString();
      if (Date.now() - new Date(firstFailedAt).getTime() > REDRIVE_WINDOW_MS) {
        log.error('[Events] Batch failed for seven days, dropping it', {
          ...describeMessage(item.body),
          firstFailedAt,
        });
        item.ack();
        continue;
      }
      try {
        await env.EVENTS.send({ ...item.body, firstFailedAt }, { delaySeconds: REDRIVE_DELAY_SECONDS });
        log.error('[Events] Batch exhausted its retries, re-driving it', {
          ...describeMessage(item.body),
          firstFailedAt,
        });
        item.ack();
      } catch (error) {
        log.error('[Events] Could not re-drive a batch, retrying', {
          ...describeMessage(item.body),
          error: describeError(error),
        });
        item.retry({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
      }
    }
    t.set('queue.rows', rows);
  });
}
