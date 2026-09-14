import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventRate = defineEndpoint('event_rate', {
  description: 'Events tracked per minute across every tenant, for the platform throughput strip',
  params: {
    start: p.dateTime(),
    end: p.dateTime(),
    exclude_source: p.string().optional(),
  },
  nodes: [
    node({
      name: 'minutes',
      sql: `
        SELECT
          toStartOfMinute(timestamp) AS bucket,
          count() AS count
        FROM events
        WHERE timestamp >= {{DateTime(start)}}
          AND timestamp < {{DateTime(end)}}
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
