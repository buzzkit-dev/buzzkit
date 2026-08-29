import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const runsCurrent = defineDatasource('runs_current', {
  description: 'The current state of every workflow run, replayed from the $run.* events',
  schema: {
    tenant_id: t.uint64(),
    workflow_id: t.string().lowCardinality(),
    workflow: t.string().lowCardinality(),
    version_id: t.string().lowCardinality(),
    subscriber_id: t.uint64(),
    external_id: t.string(),
    run_id: t.string(),
    status: t.string().lowCardinality(),
    step: t.string().nullable(),
    summary: t.string(),
    started_at: t.dateTime64(3),
    updated_at: t.dateTime64(3),
    sequence: t.uint64(),
  },
  engine: engine.replacingMergeTree({
    ver: 'sequence',
    sortingKey: ['tenant_id', 'workflow_id', 'run_id'],
  }),
});
