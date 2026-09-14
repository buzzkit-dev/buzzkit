import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventTopAll = defineEndpoint('event_top_all', {
  description: 'The most frequent event names across every tenant, for platform admins',
  params: {
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
        WHERE hour >= {{DateTime(start)}}
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
