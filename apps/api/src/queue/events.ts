import type { ActorEventRow } from '@buzzkit/api/actor/types';
import { createDb } from '@buzzkit/api/libs/database';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import { appendEvents, type EventRow, formatClickHouseTime } from '@buzzkit/api/libs/tinybird';
import { type Db, inArray, tables } from '@buzzkit/database';

export type EventsQueueMessage = {
  tenantId: number;
  subscriberId: number;
  externalId: string;
  rows: ActorEventRow[];
};

const RETRY_DELAY_SECONDS = 30;

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
  await trace('queue.events.batch', { 'queue.batch_size': batch.messages.length }, async (t) => {
    const db = createDb({ max: 2 });
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
      batch.ackAll();
    } catch (error) {
      log.error('[Events] Tinybird did not commit the batch, retrying', {
        rows: rows.length,
        error: describeError(error),
      });
      batch.retryAll({ delaySeconds: RETRY_DELAY_SECONDS });
    }
  });
}
