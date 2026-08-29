import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventVolume = defineEndpoint('event_volume', {
  description: 'Event counts and distinct subscribers per time bucket',
  params: {
    tenant_id: p.uint64(),
    name: p.string().optional(),
    start: p.dateTime(),
    end: p.dateTime(),
    exclude_source: p.string().optional(),
    bucket_seconds: p.int32().optional(3600),
  },
  nodes: [
    node({
      name: 'buckets',
      sql: `
        SELECT
          toStartOfInterval(hour, INTERVAL {{Int32(bucket_seconds, 3600)}} SECOND) AS bucket,
          countMerge(count) AS count,
          uniqMerge(subscribers) AS subscribers
        FROM event_names_hourly
        WHERE tenant_id = {{UInt64(tenant_id)}}
          {% if defined(name) %} AND name = {{String(name)}} {% end %}
          AND hour >= {{DateTime(start)}}
          AND hour < {{DateTime(end)}}
          {% if defined(exclude_source) %} AND source != {{String(exclude_source)}} {% end %}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    }),
  ],
  output: {
    bucket: t.dateTime(),
    count: t.uint64(),
    subscribers: t.uint64(),
  },
});
