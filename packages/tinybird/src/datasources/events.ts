import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const events = defineDatasource('events', {
  description: 'Product and engine events, one row per event',
  schema: {
    workspace_id: t.uint64(),
    tenant_id: t.uint64(),
    subscriber_id: t.uint64(),
    external_id: t.string(),
    id: t.string(),
    sequence: t.uint64(),
    name: t.string().lowCardinality(),
    source: t.string().lowCardinality(),
    timestamp: t.dateTime64(3),
    received_at: t.dateTime64(3),
    data: t.json(),
    data_raw: t.string(),
    run_id: t.string().nullable(),
    message_id: t.string().nullable(),
    step: t.string().nullable(),
  },
  engine: engine.replacingMergeTree({
    ver: 'sequence',
    sortingKey: ['tenant_id', 'name', 'subscriber_id', 'timestamp', 'id'],
    partitionKey: 'toYYYYMM(timestamp)',
    ttl: 'toDateTime(timestamp) + toIntervalMonth(13)',
  }),
});
