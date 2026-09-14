import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventVolumeAll = defineEndpoint('event_volume_all', {
  description: 'Event counts per time bucket across every tenant, for platform admins',
  params: {
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
          countMerge(count) AS count
        FROM event_names_hourly
        WHERE hour >= {{DateTime(start)}}
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
  },
});
