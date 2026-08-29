import { defineEndpoint, node, p, t } from '@tinybirdco/sdk';

export const runs = defineEndpoint('runs', {
  description:
    'Runs of a workflow newest first, optionally one status or one run, keyset-paged by (started_at, run_id)',
  params: {
    tenant_id: p.uint64(),
    workflow_id: p.string().optional(),
    run_id: p.string().optional(),
    status: p.string().optional(),
    before: p.dateTime64().optional(),
    before_id: p.string().optional(),
    limit: p.int32().optional(50),
  },
  nodes: [
    node({
      name: 'list',
      sql: `
        SELECT
          run_id, workflow_id, workflow, version_id, subscriber_id, external_id,
          status, step, summary, started_at, updated_at
        FROM runs_current FINAL
        WHERE tenant_id = {{UInt64(tenant_id)}}
          {% if defined(workflow_id) %} AND workflow_id = {{String(workflow_id)}} {% end %}
          {% if defined(run_id) %} AND run_id = {{String(run_id)}} {% end %}
          {% if defined(status) %} AND status = {{String(status)}} {% end %}
          {% if defined(before) and defined(before_id) %}
            AND (started_at, run_id) < ({{DateTime64(before)}}, {{String(before_id)}})
          {% end %}
        ORDER BY started_at DESC, run_id DESC
        LIMIT {{Int32(limit, 50)}}
      `,
    }),
  ],
  output: {
    run_id: t.string(),
    workflow_id: t.string(),
    workflow: t.string(),
    version_id: t.string(),
    subscriber_id: t.uint64(),
    external_id: t.string(),
    status: t.string(),
    step: t.string().nullable(),
    summary: t.string(),
    started_at: t.dateTime64(3),
    updated_at: t.dateTime64(3),
  },
});
