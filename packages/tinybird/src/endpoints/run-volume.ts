import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runVolume = defineEndpoint('run_volume', {
  description: 'Runs started per hour, split by where they stand now',
  params: {
    tenant_id: p.uint64(),
    start: p.dateTime(),
    end: p.dateTime(),
  },
  nodes: [
    node({
      name: 'hours',
      sql: `
        SELECT
          toStartOfHour(started_at) AS bucket,
          count() AS started,
          countIf(status IN ('running', 'sleeping', 'waiting')) AS live,
          countIf(status = 'completed') AS completed,
          countIf(status = 'canceled') AS canceled,
          countIf(status = 'failed') AS failed
        FROM runs_current FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          AND started_at >= {{DateTime(start)}}
          AND started_at < {{DateTime(end)}}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    }),
  ],
  output: {
    bucket: t.dateTime(),
    started: t.uint64(),
    live: t.uint64(),
    completed: t.uint64(),
    canceled: t.uint64(),
    failed: t.uint64(),
  },
});
