import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runLatest = defineEndpoint('run_latest', {
  description: 'When each workflow last started a run',
  params: {
    tenant_id: p.uint64(),
  },
  nodes: [
    node({
      name: 'latest',
      sql: `
        SELECT workflow_id, max(started_at) AS last_started_at
        FROM runs_current FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
        GROUP BY workflow_id
      `,
    }),
  ],
  output: {
    workflow_id: t.string(),
    last_started_at: t.dateTime64(3),
  },
});
