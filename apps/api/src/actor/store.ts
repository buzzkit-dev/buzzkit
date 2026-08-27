import { ACTOR_SCHEMA } from './schema';
import type { ActorEventInput, ActorEventRow, ActorIdentity, ActorProjection } from './types';

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

  listRecent(limit: number): ActorEventRow[] {
    return this.sql<ActorEventRow>`SELECT * FROM events ORDER BY sequence DESC LIMIT ${limit}`;
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
    const keepFrom = (newest?.sequence ?? 0) - retained;
    if (keepFrom <= 0) return 0;
    const [count] = this.sql<{ count: number }>`
      SELECT count(*) AS count FROM events WHERE sequence <= ${flushed} AND sequence < ${keepFrom}
    `;
    this.sql`DELETE FROM events WHERE sequence <= ${flushed} AND sequence < ${keepFrom}`;
    return count?.count ?? 0;
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
