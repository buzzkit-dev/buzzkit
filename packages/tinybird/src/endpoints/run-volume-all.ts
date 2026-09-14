import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runVolumeAll = defineEndpoint('run_volume_all', {
  description: 'Runs started per hour across every tenant, split by where they stand now',
  params: {
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
        WHERE started_at >= {{DateTime(start)}}
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
