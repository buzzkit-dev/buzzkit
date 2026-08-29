import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runSteps = defineEndpoint('run_steps', {
  description: "One run's events oldest first, from the subscriber's timeline",
  params: {
    tenant_id: p.uint64(),
    subscriber_id: p.uint64(),
    run_id: p.string(),
    limit: p.int32().optional(1000),
  },
  nodes: [
    node({
      name: 'steps',
      sql: `
        SELECT
          id, sequence, name, source, timestamp, received_at, data_raw AS data, run_id, message_id, step
        FROM events_by_subscriber FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          AND subscriber_id = {{UInt64(subscriber_id)}}
          AND run_id = {{String(run_id)}}
        ORDER BY sequence ASC
        LIMIT {{Int32(limit, 1000)}}
      `,
    }),
  ],
  output: {
    id: t.string(),
    sequence: t.uint64(),
    name: t.string(),
    source: t.string(),
    timestamp: t.dateTime64(3),
    received_at: t.dateTime64(3),
    data: t.string(),
    run_id: t.string().nullable(),
    message_id: t.string().nullable(),
    step: t.string().nullable(),
  },
});
