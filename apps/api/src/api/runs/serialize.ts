import type { ActorRunRow } from '@buzzkit/api/actor/types';
import { parseClickHouseTime } from '@buzzkit/api/libs/tinybird';
import type { RunRecord, RunRow, RunStatus } from './types';

export function serializeRun(row: RunRow): RunRecord {
  return {
    id: row.run_id,
    workflowId: row.workflow_id,
    workflow: row.workflow,
    versionId: row.version_id,
    externalId: row.external_id,
    status: row.status as RunStatus,
    step: row.step,
    summary: row.summary || null,
    startedAt: parseClickHouseTime(row.started_at),
    updatedAt: parseClickHouseTime(row.updated_at),
  };
}

export function serializeActorRun(row: ActorRunRow, externalId: string): RunRecord {
  return {
    id: row.run_id,
    workflowId: row.workflow_id,
    workflow: row.workflow_slug,
    versionId: row.version_id,
    externalId,
    status: row.status,
    step: row.step,
    summary: row.detail || null,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}
