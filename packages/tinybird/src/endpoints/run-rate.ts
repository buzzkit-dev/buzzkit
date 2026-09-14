import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runRate = defineEndpoint('run_rate', {
  description: 'Runs started per minute across every tenant, for the platform throughput strip',
  params: {
    start: p.dateTime(),
    end: p.dateTime(),
  },
  nodes: [
    node({
      name: 'minutes',
      sql: `
        SELECT
          toStartOfMinute(started_at) AS bucket,
          count() AS count
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
    count: t.uint64(),
  },
});
