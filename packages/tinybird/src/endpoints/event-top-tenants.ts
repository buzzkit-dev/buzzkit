import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventTopTenants = defineEndpoint('event_top_tenants', {
  description: 'The tenants with the most events in a window, for platform admins',
  params: {
    start: p.dateTime(),
    end: p.dateTime(),
    exclude_source: p.string().optional(),
    limit: p.int32().optional(20),
  },
  nodes: [
    node({
      name: 'top',
      sql: `
        SELECT tenant_id, countMerge(count) AS count
        FROM event_names_hourly
        WHERE hour >= {{DateTime(start)}}
          AND hour < {{DateTime(end)}}
          {% if defined(exclude_source) %} AND source != {{String(exclude_source)}} {% end %}
        GROUP BY tenant_id
        ORDER BY count DESC, tenant_id ASC
        LIMIT {{Int32(limit, 20)}}
      `,
    }),
  ],
  output: {
    tenant_id: t.uint64(),
    count: t.uint64(),
  },
});
