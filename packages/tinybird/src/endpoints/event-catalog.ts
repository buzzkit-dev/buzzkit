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
          catalog.name AS name,
          catalog.count_24h AS count_24h,
          catalog.count_7d AS count_7d,
          catalog.count_30d AS count_30d,
          catalog.count_total AS count_total,
          catalog.subscribers_7d AS subscribers_7d,
          catalog.sources AS sources,
          webhook.providers AS providers,
          catalog.last_at AS last_at,
          catalog.first_at AS first_at
        FROM (
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
        ) AS catalog
        LEFT JOIN (
          SELECT
            name,
            arraySort(groupUniqArrayIf(JSONExtractString(data_raw, '$provider'), JSONExtractString(data_raw, '$provider') != '')) AS providers
          FROM events
          WHERE tenant_id = {{UInt64(tenant_id)}} AND source = 'webhook'
          GROUP BY name
        ) AS webhook USING (name)
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
    providers: t.array(t.string()),
    last_at: t.dateTime64(3),
    first_at: t.dateTime(),
  },
});
