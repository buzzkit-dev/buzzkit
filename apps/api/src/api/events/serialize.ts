import { parseClickHouseTime } from '@buzzkit/api/libs/tinybird';
import type { EventNameRow, EventRecord, EventRow } from './types';

export function serializeEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    sequence: row.sequence,
    name: row.name,
    source: row.source,
    externalId: row.external_id ?? null,
    timestamp: parseClickHouseTime(row.timestamp),
    receivedAt: parseClickHouseTime(row.received_at),
    data: JSON.parse(row.data) as Record<string, unknown>,
    runId: row.run_id,
    messageId: row.message_id,
    step: row.step,
  };
}

export function serializeEventName(row: EventNameRow) {
  return {
    name: row.name,
    counts: { last24h: row.count_24h, last7d: row.count_7d, last30d: row.count_30d, total: row.count_total },
    subscribers7d: row.subscribers_7d,
    sources: row.sources,
    lastAt: parseClickHouseTime(row.last_at),
    firstAt: parseClickHouseTime(row.first_at),
  };
}
