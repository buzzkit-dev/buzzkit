import { serializeEvent } from '@buzzkit/api/api/events/index';
import { findSubscriberById } from '@buzzkit/api/api/subscribers/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { formatClickHouseTime, parseClickHouseTime, tinybird } from '@buzzkit/api/libs/tinybird';
import type { Db } from '@buzzkit/database';
import { ACTOR_RECENT_EVENTS, RUN_EVENTS_LIMIT } from './constants';
import { serializeActorRun, serializeRun } from './serialize';
import type {
  RunCounts,
  RunCursor,
  RunDetail,
  RunIdParts,
  RunPage,
  RunRecord,
  RunRow,
  RunStatus,
} from './types';

export * from './constants';
export * from './serialize';
export * from './types';

const RUN_ID_PATTERN = /^(\d+)-(wf_[A-Za-z0-9]+)-(\d+)-(\d+)$/;

export function parseRunId(runId: string): RunIdParts | null {
  const match = RUN_ID_PATTERN.exec(runId);
  if (!match) return null;
  return {
    tenantId: Number(match[1]),
    workflowId: match[2]!,
    subscriberId: Number(match[3]),
    sequence: Number(match[4]),
  };
}

export function emptyRunCounts(): RunCounts {
  return { running: 0, sleeping: 0, waiting: 0, steps: {} };
}

export function encodeRunCursor(row: Pick<RunRow, 'started_at' | 'run_id'>): string {
  return `${parseClickHouseTime(row.started_at)}_${row.run_id}`;
}

export function resolveRunCursor(cursor: string | undefined): RunCursor | undefined {
  if (cursor === undefined) return undefined;
  const split = cursor.indexOf('_');
  const startedAt = split === -1 ? cursor : cursor.slice(0, split);
  const id = split === -1 ? '' : cursor.slice(split + 1);
  if (Number.isNaN(new Date(startedAt).getTime()) || !parseRunId(id)) {
    throw new BadRequestError('Invalid cursor', { code: 'invalid_cursor', param: 'cursor' });
  }
  return { startedAt: new Date(startedAt).toISOString(), id };
}

export async function listRuns(
  tenantId: number,
  workflowId: string | undefined,
  options: { status?: RunStatus; before?: RunCursor; limit: number }
): Promise<RunPage> {
  const result = await trace('runs.list', async () =>
    (await tinybird()).runs.query({
      tenant_id: tenantId,
      workflow_id: workflowId,
      status: options.status,
      before: options.before ? formatClickHouseTime(options.before.startedAt) : undefined,
      before_id: options.before?.id,
      limit: options.limit + 1,
    })
  );
  const rows = result.data as RunRow[];
  const page = rows.slice(0, options.limit);
  const hasMore = rows.length > options.limit;
  const last = page[page.length - 1];
  return {
    items: page.map(serializeRun),
    hasMore,
    nextCursor: hasMore && last ? encodeRunCursor(last) : null,
  };
}

export async function countLiveRuns(tenantId: number, workflowId?: string): Promise<Map<string, RunCounts>> {
  const result = await trace('runs.count', async () =>
    (await tinybird()).runCounts.query({ tenant_id: tenantId, workflow_id: workflowId })
  );
  const counts = new Map<string, RunCounts>();
  for (const row of result.data) {
    const entry = counts.get(row.workflow_id) ?? emptyRunCounts();
    const count = Number(row.count);
    if (row.status === 'running' || row.status === 'sleeping' || row.status === 'waiting')
      entry[row.status] += count;
    if (row.step) entry.steps[row.step] = (entry.steps[row.step] ?? 0) + count;
    counts.set(row.workflow_id, entry);
  }
  return counts;
}

export async function listSubscriberRuns(
  tenantId: number,
  subscriber: { id: number; externalId: string }
): Promise<RunRecord[]> {
  const actor = await subscriberActor(tenantId, subscriber.id);
  const rows = await trace('runs.listForSubscriber', async () => actor.listRuns());
  return rows.map((row) => serializeActorRun(row, subscriber.externalId));
}

export async function findRun(db: Db, tenantId: number, runId: string): Promise<RunDetail> {
  const parts = parseRunId(runId);
  if (!parts || parts.tenantId !== tenantId) throw new NotFoundError('Run not found');

  const actor = await subscriberActor(tenantId, parts.subscriberId);
  const [live, recent, stored, history] = await trace('runs.find', async () =>
    Promise.all([
      actor.findRun(runId),
      actor.listRecent(ACTOR_RECENT_EVENTS),
      (await tinybird()).runs.query({ tenant_id: tenantId, run_id: runId, limit: 1 }),
      (await tinybird()).runSteps.query({
        tenant_id: tenantId,
        subscriber_id: parts.subscriberId,
        run_id: runId,
        limit: RUN_EVENTS_LIMIT,
      }),
    ])
  );
  const row = (stored.data as RunRow[])[0];
  if (!live && !row) throw new NotFoundError('Run not found');

  const externalId =
    row?.external_id ?? (await findSubscriberById(db, tenantId, parts.subscriberId)).externalId;
  const run = live ? serializeActorRun(live, externalId) : serializeRun(row!);

  const byId = new Map(history.data.map((event) => [event.id, event]));
  for (const event of recent) if (event.run_id === runId && !byId.has(event.id)) byId.set(event.id, event);
  const events = [...byId.values()]
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map((event) => serializeEvent({ ...event, external_id: externalId }));

  return { ...run, events };
}
