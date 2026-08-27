import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventRecent = defineEndpoint('event_recent', {
  description: 'Newest events for a tenant, optionally one name, keyset-paged by received_at',
  params: {
    tenant_id: p.uint64(),
    name: p.string().optional(),
    source: p.string().optional(),
    before: p.dateTime64().optional(),
    after: p.dateTime64().optional(),
    limit: p.int32().optional(50),
  },
  nodes: [
    node({
      name: 'recent',
      sql: `
        SELECT
          id, sequence, name, source, subscriber_id, external_id,
          timestamp, received_at, data_raw AS data, run_id, message_id, step
        FROM events FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          {% if defined(name) %} AND name = {{String(name)}} {% end %}
          {% if defined(source) %} AND source = {{String(source)}} {% end %}
          {% if defined(before) %} AND received_at < {{DateTime64(before)}} {% end %}
          {% if defined(after) %} AND received_at > {{DateTime64(after)}} {% end %}
        ORDER BY received_at DESC, id DESC
        LIMIT {{Int32(limit, 50)}}
      `,
    }),
  ],
  output: {
    id: t.string(),
    sequence: t.uint64(),
    name: t.string(),
    source: t.string(),
    subscriber_id: t.uint64(),
    external_id: t.string(),
    timestamp: t.dateTime64(3),
    received_at: t.dateTime64(3),
    data: t.string(),
    run_id: t.string().nullable(),
    message_id: t.string().nullable(),
    step: t.string().nullable(),
  },
});
