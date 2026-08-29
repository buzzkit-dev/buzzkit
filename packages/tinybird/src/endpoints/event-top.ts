import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventTop = defineEndpoint('event_top', {
  description: 'The most frequent event names in a window',
  params: {
    tenant_id: p.uint64(),
    start: p.dateTime(),
    end: p.dateTime(),
    exclude_source: p.string().optional(),
    limit: p.int32().optional(5),
  },
  nodes: [
    node({
      name: 'top',
      sql: `
        SELECT name, countMerge(count) AS count
        FROM event_names_hourly
        WHERE tenant_id = {{UInt64(tenant_id)}}
          AND hour >= {{DateTime(start)}}
          AND hour < {{DateTime(end)}}
          {% if defined(exclude_source) %} AND source != {{String(exclude_source)}} {% end %}
        GROUP BY name
        ORDER BY count DESC, name ASC
        LIMIT {{Int32(limit, 5)}}
      `,
    }),
  ],
  output: {
    name: t.string(),
    count: t.uint64(),
  },
});
