import { ACTOR_SCHEMA } from './schema';
import type {
  ActorDefinitions,
  ActorEventInput,
  ActorEventRow,
  ActorIdentity,
  ActorProjection,
  ActorRunRow,
  ActorRunStatus,
  ActorWaitRow,
} from './types';

type Sql = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

export class ActorStore {
  constructor(private readonly sql: Sql) {}

  migrate(): void {
    for (const statement of ACTOR_SCHEMA) {
      this.sql([statement] as unknown as TemplateStringsArray);
    }
  }

  readIdentity(): ActorIdentity | null {
    const tenantId = this.readMeta('tenant_id');
    const subscriberId = this.readMeta('subscriber_id');
    const externalId = this.readMeta('external_id');
    if (!tenantId || !subscriberId || externalId === null) return null;
    return { tenantId: Number(tenantId), subscriberId: Number(subscriberId), externalId };
  }

  writeIdentity(identity: ActorIdentity): void {
    this.writeMeta('tenant_id', String(identity.tenantId));
    this.writeMeta('subscriber_id', String(identity.subscriberId));
    this.writeMeta('external_id', identity.externalId);
  }

  findByIdempotencyKey(key: string): { sequence: number; id: string } | null {
    const [row] = this.sql<{ sequence: number; id: string }>`
      SELECT sequence, id FROM events WHERE idempotency_key = ${key}
    `;
    return row ?? null;
  }

  insertEvent(event: ActorEventInput): number {
    this.sql`
      INSERT INTO events (id, idempotency_key, name, source, timestamp, received_at, data, run_id, message_id, step)
      VALUES (
        ${event.id}, ${event.idempotencyKey}, ${event.name}, ${event.source}, ${event.timestamp},
        ${event.receivedAt}, ${JSON.stringify(event.data)}, ${event.runId ?? null},
        ${event.messageId ?? null}, ${event.step ?? null}
      )
    `;
    const [inserted] = this.sql<{ sequence: number }>`SELECT last_insert_rowid() AS sequence`;
    return inserted!.sequence;
  }

  recordProjection(name: string, sequence: number, timestamp: string): void {
    this.sql`
      INSERT INTO projections (name, count, last_sequence, last_at)
      VALUES (${name}, 1, ${sequence}, ${timestamp})
      ON CONFLICT (name) DO UPDATE SET
        count = count + 1,
        last_sequence = excluded.last_sequence,
        last_at = max(last_at, excluded.last_at)
    `;
  }

  listProjections(): ActorProjection[] {
    return this.sql<ActorProjection>`SELECT * FROM projections ORDER BY name ASC`;
  }

  listRecent(limit: number, beforeSequence?: number): ActorEventRow[] {
    if (beforeSequence === undefined) {
      return this.sql<ActorEventRow>`SELECT * FROM events ORDER BY sequence DESC LIMIT ${limit}`;
    }
    return this.sql<ActorEventRow>`
      SELECT * FROM events WHERE sequence < ${beforeSequence} ORDER BY sequence DESC LIMIT ${limit}
    `;
  }

  listUnflushed(limit: number): ActorEventRow[] {
    const flushed = this.readFlushedSequence();
    return this.sql<ActorEventRow>`
      SELECT * FROM events WHERE sequence > ${flushed} ORDER BY sequence ASC LIMIT ${limit}
    `;
  }

  readFlushedSequence(): number {
    return Number(this.readMeta('flushed_sequence') ?? 0);
  }

  advanceFlushedSequence(sequence: number): void {
    this.writeMeta('flushed_sequence', String(sequence));
  }

  prune(retained: number): number {
    const flushed = this.readFlushedSequence();
    const [newest] = this.sql<{ sequence: number | null }>`SELECT max(sequence) AS sequence FROM events`;
    const keepFrom = (newest?.sequence ?? 0) - retained + 1;
    if (keepFrom <= 1) return 0;
    const [count] = this.sql<{ count: number }>`
      SELECT count(*) AS count FROM events WHERE sequence <= ${flushed} AND sequence < ${keepFrom}
    `;
    this.sql`DELETE FROM events WHERE sequence <= ${flushed} AND sequence < ${keepFrom}`;
    return count?.count ?? 0;
  }

  readAttributes(): Record<string, unknown> {
    const raw = this.readMeta('attributes');
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  writeAttributes(attributes: Record<string, unknown>): void {
    this.writeMeta('attributes', JSON.stringify(attributes));
  }

  readDefinitions(): ActorDefinitions | null {
    const raw = this.readMeta('definitions');
    return raw ? (JSON.parse(raw) as ActorDefinitions) : null;
  }

  writeDefinitions(definitions: ActorDefinitions): void {
    this.writeMeta('definitions', JSON.stringify(definitions));
  }

  readDefinitionsCheckedAt(): number {
    return Number(this.readMeta('definitions_checked_at') ?? 0);
  }

  writeDefinitionsCheckedAt(at: number): void {
    this.writeMeta('definitions_checked_at', String(at));
  }

  insertRun(run: ActorRunRow): void {
    this.sql`
      INSERT INTO runs (run_id, workflow_id, workflow_slug, version_id, status, step, detail, trigger_sequence, started_at, updated_at)
      VALUES (
        ${run.run_id}, ${run.workflow_id}, ${run.workflow_slug}, ${run.version_id}, ${run.status}, ${run.step},
        ${run.detail}, ${run.trigger_sequence}, ${run.started_at}, ${run.updated_at}
      )
    `;
  }

  updateRun(
    runId: string,
    status: ActorRunStatus,
    step: string | null,
    detail: string | null,
    at: string
  ): void {
    this.sql`
      UPDATE runs SET status = ${status}, step = ${step}, detail = ${detail}, updated_at = ${at} WHERE run_id = ${runId}
    `;
  }

  findRun(runId: string): ActorRunRow | null {
    const [row] = this.sql<ActorRunRow>`SELECT * FROM runs WHERE run_id = ${runId}`;
    return row ?? null;
  }

  listLiveRuns(workflowId?: string): ActorRunRow[] {
    if (workflowId === undefined) {
      return this.sql<ActorRunRow>`
        SELECT * FROM runs WHERE status IN ('running', 'sleeping', 'waiting') ORDER BY started_at DESC
      `;
    }
    return this.sql<ActorRunRow>`
      SELECT * FROM runs WHERE workflow_id = ${workflowId} AND status IN ('running', 'sleeping', 'waiting')
      ORDER BY started_at DESC
    `;
  }

  listRuns(limit: number): ActorRunRow[] {
    return this.sql<ActorRunRow>`SELECT * FROM runs ORDER BY started_at DESC LIMIT ${limit}`;
  }

  insertWait(wait: ActorWaitRow): void {
    this.sql`
      INSERT INTO waits (run_id, step, event, condition, expires_at)
      VALUES (${wait.run_id}, ${wait.step}, ${wait.event}, ${wait.condition}, ${wait.expires_at})
      ON CONFLICT (run_id, step) DO UPDATE SET event = excluded.event, condition = excluded.condition, expires_at = excluded.expires_at
    `;
  }

  deleteWait(runId: string, step: string): void {
    this.sql`DELETE FROM waits WHERE run_id = ${runId} AND step = ${step}`;
  }

  deleteWaitsOfRun(runId: string): void {
    this.sql`DELETE FROM waits WHERE run_id = ${runId}`;
  }

  listWaitsFor(event: string, now: string): ActorWaitRow[] {
    return this.sql<ActorWaitRow>`SELECT * FROM waits WHERE event = ${event} AND expires_at > ${now}`;
  }

  private readMeta(key: string): string | null {
    const [row] = this.sql<{ value: string }>`SELECT value FROM meta WHERE key = ${key}`;
    return row?.value ?? null;
  }

  private writeMeta(key: string, value: string): void {
    this.sql`
      INSERT INTO meta (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `;
  }
}
