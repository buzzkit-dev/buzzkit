import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runCounts = defineEndpoint('run_counts', {
  description: 'Live runs per workflow, status and step',
  params: {
    tenant_id: p.uint64(),
    workflow_id: p.string().optional(),
  },
  nodes: [
    node({
      name: 'counts',
      sql: `
        SELECT workflow_id, status, step, count() AS count
        FROM runs_current FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          {% if defined(workflow_id) %} AND workflow_id = {{String(workflow_id)}} {% end %}
          AND status IN ('running', 'sleeping', 'waiting')
        GROUP BY workflow_id, status, step
      `,
    }),
  ],
  output: {
    workflow_id: t.string(),
    status: t.string(),
    step: t.string().nullable(),
    count: t.uint64(),
  },
});
