import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const subscriberTimeline = defineEndpoint('subscriber_timeline', {
  description: "A subscriber's events newest first",
  params: {
    tenant_id: p.uint64(),
    subscriber_id: p.uint64(),
    before_sequence: p.uint64().optional(),
    limit: p.int32().optional(50),
  },
  nodes: [
    node({
      name: 'timeline',
      sql: `
        SELECT
          id, sequence, name, source, timestamp, received_at, data_raw AS data, run_id, message_id, step
        FROM events_by_subscriber FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          AND subscriber_id = {{UInt64(subscriber_id)}}
          {% if defined(before_sequence) %} AND sequence < {{UInt64(before_sequence)}} {% end %}
        ORDER BY sequence DESC
        LIMIT {{Int32(limit, 50)}}
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
