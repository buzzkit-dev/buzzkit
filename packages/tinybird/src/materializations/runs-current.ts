import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { runsCurrent } from '../datasources/runs-current';

export const runsCurrentMv = defineMaterializedView('runs_current_mv', {
  description:
    'Every $run.* event becomes the current row of its run: started opens it, a step moves it, completed / cancelled / failed close it',
  datasource: runsCurrent,
  nodes: [
    node({
      name: 'current',
      sql: `
        SELECT
          tenant_id,
          JSONExtractString(data_raw, 'workflowId') AS workflow_id,
          JSONExtractString(data_raw, 'workflow') AS workflow,
          JSONExtractString(data_raw, 'versionId') AS version_id,
          subscriber_id,
          external_id,
          assumeNotNull(run_id) AS run_id,
          multiIf(
            name = '$run.started', 'running',
            name = '$run.step', if(JSONExtractString(data_raw, 'status') = 'completed', 'running', JSONExtractString(data_raw, 'status')),
            name = '$run.completed', 'completed',
            name = '$run.cancelled', 'cancelled',
            'failed'
          ) AS status,
          step,
          multiIf(
            name = '$run.step', JSONExtractString(data_raw, 'summary'),
            name = '$run.failed', JSONExtractString(data_raw, 'error'),
            name = '$run.cancelled', JSONExtractString(data_raw, 'reason'),
            ''
          ) AS summary,
          parseDateTime64BestEffort(JSONExtractString(data_raw, 'startedAt'), 3) AS started_at,
          timestamp AS updated_at,
          sequence
        FROM events
        WHERE name IN ('$run.started', '$run.step', '$run.completed', '$run.cancelled', '$run.failed')
          AND run_id IS NOT NULL
          AND JSONHas(data_raw, 'startedAt')
      `,
    }),
  ],
});
