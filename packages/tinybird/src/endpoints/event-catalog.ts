import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const eventCatalog = defineEndpoint('event_catalog', {
  description: 'Event names with 24h/7d/30d volume, 7d reach, sources and last seen',
  params: {
    tenant_id: p.uint64(),
  },
  nodes: [
    node({
      name: 'catalog',
      sql: `
        SELECT
          name,
          countMergeIf(count, hour >= now() - toIntervalHour(24)) AS count_24h,
          countMergeIf(count, hour >= now() - toIntervalDay(7)) AS count_7d,
          countMergeIf(count, hour >= now() - toIntervalDay(30)) AS count_30d,
          countMerge(count) AS count_total,
          uniqMergeIf(subscribers, hour >= now() - toIntervalDay(7)) AS subscribers_7d,
          arraySort(groupUniqArray(source)) AS sources,
          max(last_at) AS last_at,
          min(hour) AS first_at
        FROM event_names_hourly
        WHERE tenant_id = {{UInt64(tenant_id)}}
        GROUP BY name
        ORDER BY count_7d DESC, name ASC
      `,
    }),
  ],
  output: {
    name: t.string(),
    count_24h: t.uint64(),
    count_7d: t.uint64(),
    count_30d: t.uint64(),
    count_total: t.uint64(),
    subscribers_7d: t.uint64(),
    sources: t.array(t.string()),
    last_at: t.dateTime64(3),
    first_at: t.dateTime(),
  },
});
