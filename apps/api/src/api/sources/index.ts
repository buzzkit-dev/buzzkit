import { trackEvents } from '@buzzkit/api/api/events/track';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import {
  currentKeyVersion,
  rewrapSecret,
  type SealedSecret,
  sealSecret,
  unsealSecret,
} from '@buzzkit/api/libs/crypto';
import { ApiError, BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, desc, eq, isNull, lt, sql, tables } from '@buzzkit/database';
import {
  type DeliveryOutcome,
  type DropReason,
  detectProvider,
  lintSourceMapping,
  lintVerification,
  MAX_SOURCE_NAME,
  type MappedEvent,
  mapPayload,
  readPath,
  SOURCE_PRESETS,
  type SourceMapping,
  type SourcePreset,
  type SourceProvider,
  type SourceStatus,
  suggestMapping,
  type Verification,
} from '@buzzkit/schema/sources';
import { t } from 'elysia';
import { type Rejection, verifyDelivery } from './verify';

export type Source = typeof tables.source.$inferSelect;

export type SourceDelivery = typeof tables.sourceDelivery.$inferSelect;

export const DELIVERY_RETENTION_DAYS = 30;

export const MAX_PAYLOAD_BYTES = 256 * 1024;

export const SourceProviderSchema = t.String({ minLength: 1, maxLength: 40 });

export const CreateSourceSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: MAX_SOURCE_NAME }),
  provider: SourceProviderSchema,
  verification: t.Optional(t.Unknown()),
  mapping: t.Optional(t.Unknown()),
  secret: t.Optional(t.String({ minLength: 1, maxLength: 4096 })),
});

export const UpdateSourceSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: MAX_SOURCE_NAME })),
  provider: t.Optional(SourceProviderSchema),
  verification: t.Optional(t.Unknown()),
  mapping: t.Optional(t.Unknown()),
  secret: t.Optional(t.String({ minLength: 1, maxLength: 4096 })),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('paused')])),
});

export const PreviewSchema = t.Object({
  payload: t.Unknown(),
  headers: t.Optional(t.Record(t.String(), t.String())),
  mapping: t.Optional(t.Unknown()),
});

function sealingContext(tenantId: number, sourceId: number): string {
  return ['source', 'v1', tenantId, sourceId].join(':');
}

function ingestUrl(sourceId: string): string {
  return `/v1/sources/${sourceId}/ingest`;
}

export function serializeSource(source: Source, id: string) {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider as SourceProvider,
    status: source.status as SourceStatus,
    url: ingestUrl(id),
    mapping: source.mapping as SourceMapping,
    verification: source.verification as Verification,
    hasSecret: source.secretCiphertext !== null,
    lastDeliveryAt: source.lastDeliveryAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function serializeDelivery(delivery: SourceDelivery) {
  return {
    id: delivery.id,
    sourceId: delivery.sourceId,
    providerEventId: delivery.providerEventId,
    providerType: delivery.providerType,
    outcome: delivery.outcome,
    reason: delivery.reason,
    detail: delivery.detail,
    subscriberId: delivery.subscriberId,
    event: delivery.eventName,
    eventId: delivery.eventId,
    payload: delivery.payload,
    receivedAt: delivery.receivedAt,
  };
}

export function assertMapping(raw: unknown): asserts raw is SourceMapping {
  const problems = lintSourceMapping(raw);
  if (problems.length > 0) {
    throw new BadRequestError(`mapping.${problems[0]!.path.join('.')}: ${problems[0]!.message}`, {
      code: 'invalid_mapping',
      param: 'mapping',
      details: { problems },
    });
  }
}

export async function listSources(db: Db, tenantId: number): Promise<Source[]> {
  return await db
    .select()
    .from(tables.source)
    .where(and(eq(tables.source.tenantId, tenantId), isNull(tables.source.deletedAt)))
    .orderBy(desc(tables.source.id));
}

export async function findSource(db: Db, tenantId: number, sourceId: number): Promise<Source> {
  const [row] = await db
    .select()
    .from(tables.source)
    .where(
      and(
        eq(tables.source.id, sourceId),
        eq(tables.source.tenantId, tenantId),
        isNull(tables.source.deletedAt)
      )
    )
    .limit(1);
  if (!row) throw new NotFoundError('Source not found');
  return row;
}

export async function findSourceForIngest(db: Db, sourceId: number): Promise<Source | null> {
  const [row] = await db
    .select()
    .from(tables.source)
    .where(and(eq(tables.source.id, sourceId), isNull(tables.source.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function findTenantById(db: Db, tenantId: number): Promise<Tenant> {
  const [row] = await db.select().from(tables.tenant).where(eq(tables.tenant.id, tenantId)).limit(1);
  if (!row) throw new NotFoundError('Tenant not found');
  return row;
}

async function sealed(tenantId: number, sourceId: number, secret: string): Promise<SealedSecret> {
  return await sealSecret(secret, sealingContext(tenantId, sourceId));
}

function presetOf(provider: string): SourcePreset {
  const preset = SOURCE_PRESETS[provider as SourceProvider];
  if (!preset) {
    throw new BadRequestError(`Unknown provider "${provider}"`, { code: 'validation', param: 'provider' });
  }
  return preset;
}

function assertVerification(value: unknown): asserts value is Verification {
  const problems = lintVerification(value);
  if (problems.length > 0) {
    throw new BadRequestError(`verification.${problems[0]!.path.join('.')}: ${problems[0]!.message}`, {
      code: 'invalid_verification',
      param: 'verification',
      details: { problems },
    });
  }
}

export async function createSource(
  db: Db,
  tenantId: number,
  input: { name: string; provider: string; verification?: unknown; mapping?: unknown; secret?: string }
): Promise<Source> {
  const preset = presetOf(input.provider);
  const mapping = input.mapping ?? preset.mapping;
  assertMapping(mapping);
  const verification = input.verification ?? preset.verification;
  assertVerification(verification);
  return await trace('sources.create', async () => {
    const [inserted] = await db
      .insert(tables.source)
      .values({
        tenantId,
        name: input.name,
        provider: preset.provider,
        verification,
        mapping,
        status: 'unverified',
      })
      .returning();
    const created = inserted as Source;
    if (!input.secret) return created;
    const [updated] = await db
      .update(tables.source)
      .set({ ...(await sealed(tenantId, created.id, input.secret)), status: 'active' })
      .where(eq(tables.source.id, created.id))
      .returning();
    return updated as Source;
  });
}

export async function updateSource(
  db: Db,
  source: Source,
  patch: {
    name?: string;
    provider?: string;
    verification?: unknown;
    mapping?: unknown;
    secret?: string;
    status?: 'active' | 'paused';
  }
): Promise<Source> {
  if (patch.mapping !== undefined) assertMapping(patch.mapping);
  if (patch.verification !== undefined) assertVerification(patch.verification);
  const provider = patch.provider === undefined ? undefined : presetOf(patch.provider).provider;
  if (patch.status === 'active' && !patch.secret && source.secretCiphertext === null) {
    throw new BadRequestError('A source needs a secret before it can be active', {
      code: 'source_unverified',
      param: 'status',
    });
  }
  const values: Partial<typeof tables.source.$inferInsert> = {
    name: patch.name,
    provider,
    verification: patch.verification as Verification | undefined,
    mapping: patch.mapping as SourceMapping | undefined,
    status: patch.status,
  };
  if (patch.secret) {
    Object.assign(values, await sealed(source.tenantId, source.id, patch.secret));
    if (source.status === 'unverified' && !patch.status) values.status = 'active';
  }
  const [updated] = await db
    .update(tables.source)
    .set(values)
    .where(eq(tables.source.id, source.id))
    .returning();
  return updated as Source;
}

export async function softDeleteSource(db: Db, sourceId: number): Promise<Source> {
  const [deleted] = await db
    .update(tables.source)
    .set({ deletedAt: new Date() })
    .where(eq(tables.source.id, sourceId))
    .returning();
  return deleted as Source;
}

async function readSecret(source: Source): Promise<string | null> {
  if (
    !source.secretCiphertext ||
    !source.secretIv ||
    !source.dekCiphertext ||
    !source.dekIv ||
    source.keyVersion === null
  ) {
    return null;
  }
  return await unsealSecret(
    {
      secretCiphertext: source.secretCiphertext,
      secretIv: source.secretIv,
      dekCiphertext: source.dekCiphertext,
      dekIv: source.dekIv,
      keyVersion: source.keyVersion,
    },
    sealingContext(source.tenantId, source.id)
  );
}

type Resolved = { subscriberId: number; externalId: string };

function subscriberPhrase(event: MappedEvent): string {
  return 'externalId' in event.subscriber
    ? event.subscriber.externalId
    : `${event.subscriber.attribute} = ${event.subscriber.value}`;
}

async function resolveSubscriber(db: Db, tenantId: number, event: MappedEvent): Promise<Resolved | null> {
  const rule = event.subscriber;
  const rows = await db
    .select({ id: tables.subscriber.id, externalId: tables.subscriber.externalId })
    .from(tables.subscriber)
    .where(
      and(
        eq(tables.subscriber.tenantId, tenantId),
        isNull(tables.subscriber.deletedAt),
        'externalId' in rule
          ? eq(tables.subscriber.externalId, rule.externalId)
          : sql`${tables.subscriber.attributes} ->> ${rule.attribute} = ${rule.value}`
      )
    )
    .orderBy(asc(tables.subscriber.id))
    .limit(1);
  const row = rows[0];
  return row ? { subscriberId: row.id, externalId: row.externalId } : null;
}

type Recorded = {
  providerEventId?: string | null;
  providerType?: string | null;
  outcome: SourceDelivery['outcome'];
  reason?: string | null;
  detail?: string | null;
  subscriberId?: number | null;
  eventName?: string | null;
  eventId?: string | null;
  payload: unknown;
};

function identify(source: Source, payload: unknown): Pick<Recorded, 'providerType' | 'providerEventId'> {
  if (typeof payload !== 'object' || payload === null) return {};
  const mapping = source.mapping as SourceMapping;
  const type = readPath(payload, mapping.type);
  const id = mapping.id ? readPath(payload, mapping.id) : undefined;
  return {
    providerType: typeof type === 'string' ? type : null,
    providerEventId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
  };
}

async function record(db: Db, source: Source, entry: Recorded): Promise<SourceDelivery> {
  const [inserted] = await db
    .insert(tables.sourceDelivery)
    .values({
      tenantId: source.tenantId,
      sourceId: source.id,
      providerEventId: entry.providerEventId ?? null,
      providerType: entry.providerType ?? null,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      detail: entry.detail ?? null,
      subscriberId: entry.subscriberId ?? null,
      eventName: entry.eventName ?? null,
      eventId: entry.eventId ?? null,
      payload: entry.payload ?? null,
    })
    .returning();
  await db.update(tables.source).set({ lastDeliveryAt: new Date() }).where(eq(tables.source.id, source.id));
  return inserted as SourceDelivery;
}

function parsePayload(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export type IngestResult = { status: 200 | 401; delivery: SourceDelivery };

export async function ingestDelivery(
  db: Db,
  source: Source,
  body: string,
  headers: Headers
): Promise<IngestResult> {
  return await trace('sources.ingest', { 'source.provider': source.provider }, async (span) => {
    const payload = parsePayload(body);
    const identified = identify(source, payload);
    const finish = async (status: 200 | 401, entry: Recorded): Promise<IngestResult> => {
      span.set('source.outcome', entry.outcome);
      return { status, delivery: await record(db, source, { ...identified, ...entry }) };
    };
    const secret = await readSecret(source);
    if (!secret || source.status === 'unverified') {
      const looksLike = detectProvider(Object.fromEntries(headers.entries()), payload);
      return finish(200, {
        outcome: 'unverified',
        detail: looksLike ? `Looks like ${SOURCE_PRESETS[looksLike].label}` : null,
        payload,
      });
    }
    const rejection: Rejection | null = await verifyDelivery(
      source.verification as Verification,
      body,
      headers,
      secret
    );
    if (rejection)
      return finish(401, {
        outcome: 'rejected',
        reason: rejection.reason,
        detail: rejection.detail,
        payload,
      });
    if (payload === undefined || typeof payload !== 'object' || payload === null) {
      return finish(200, {
        outcome: 'dropped',
        reason: 'invalid_data',
        detail: 'The body is not a JSON object',
        payload: null,
      });
    }
    if (source.status === 'paused') {
      return finish(200, { outcome: 'dropped', reason: 'paused', detail: 'The source is paused', payload });
    }
    const mapped = mapPayload(source.mapping as SourceMapping, payload);
    if (mapped.outcome === 'dropped') {
      return finish(200, { outcome: 'dropped', reason: mapped.reason, detail: mapped.detail, payload });
    }
    const { event } = mapped;
    if (event.providerEventId) {
      if (await seenEvent(db, source.id, event.providerEventId)) {
        return finish(200, {
          outcome: 'duplicate',
          providerEventId: event.providerEventId,
          providerType: event.providerType,
          detail: 'Already turned into an event',
          payload,
        });
      }
    }
    const resolved = await resolveSubscriber(db, source.tenantId, event);
    if (!resolved) {
      const who = subscriberPhrase(event);
      return finish(200, {
        outcome: 'dropped',
        reason: 'no_subscriber' satisfies DropReason,
        detail: `No subscriber with ${who}`,
        providerEventId: event.providerEventId,
        providerType: event.providerType,
        payload,
      });
    }
    const tenant = await findTenantById(db, source.tenantId);
    let tracked: { id: string } | undefined;
    try {
      [tracked] = await trackEvents(db, tenant, {
        source: 'webhook',
        events: [
          {
            externalId: resolved.externalId,
            name: event.name,
            data: { ...event.data, $provider: source.provider },
            ...(event.timestamp ? { timestamp: event.timestamp } : {}),
          },
        ],
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return finish(200, {
        outcome: 'dropped',
        reason: 'invalid_data',
        detail: error.param ? `${error.param}: ${error.message}` : error.message,
        providerEventId: event.providerEventId,
        providerType: event.providerType,
        payload,
      });
    }
    return finish(200, {
      outcome: 'event',
      providerEventId: event.providerEventId,
      providerType: event.providerType,
      subscriberId: resolved.subscriberId,
      eventName: event.name,
      eventId: tracked?.id ?? null,
      payload,
    });
  });
}

async function seenEvent(db: Db, sourceId: number, providerEventId: string): Promise<boolean> {
  const [seen] = await db
    .select({ id: tables.sourceDelivery.id })
    .from(tables.sourceDelivery)
    .where(
      and(
        eq(tables.sourceDelivery.sourceId, sourceId),
        eq(tables.sourceDelivery.providerEventId, providerEventId),
        eq(tables.sourceDelivery.outcome, 'event')
      )
    )
    .limit(1);
  return seen !== undefined;
}

export async function previewDelivery(
  db: Db,
  source: Source,
  payload: unknown,
  headers: Record<string, string> = {},
  rawMapping?: unknown
) {
  let mapping = source.mapping as SourceMapping;
  if (rawMapping !== undefined) {
    assertMapping(rawMapping);
    mapping = rawMapping;
  }
  const suggestions = suggestMapping(payload, headers);
  const mapped = mapPayload(mapping, payload);
  if (mapped.outcome === 'dropped') return { ...mapped, suggestions };
  const { event } = mapped;
  const resolved = await resolveSubscriber(db, source.tenantId, event);
  if (!resolved) {
    return {
      outcome: 'dropped' as const,
      reason: 'no_subscriber' satisfies DropReason,
      detail: `No subscriber with ${subscriberPhrase(event)}`,
      suggestions,
    };
  }
  return { outcome: 'event' as const, event: { ...event, externalId: resolved.externalId }, suggestions };
}

export async function countDeliveries(db: Db, sourceId: number, outcome?: DeliveryOutcome): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tables.sourceDelivery)
    .where(
      and(
        eq(tables.sourceDelivery.sourceId, sourceId),
        outcome ? eq(tables.sourceDelivery.outcome, outcome) : undefined
      )
    );
  return row?.total ?? 0;
}

export async function listDeliveries(
  db: Db,
  sourceId: number,
  options: { limit: number; beforeId?: number; outcome?: DeliveryOutcome }
): Promise<SourceDelivery[]> {
  return await db
    .select()
    .from(tables.sourceDelivery)
    .where(
      and(
        eq(tables.sourceDelivery.sourceId, sourceId),
        options.outcome ? eq(tables.sourceDelivery.outcome, options.outcome) : undefined,
        options.beforeId ? lt(tables.sourceDelivery.id, options.beforeId) : undefined
      )
    )
    .orderBy(desc(tables.sourceDelivery.id))
    .limit(options.limit + 1);
}

export async function purgeSourceDeliveries(db: Db, limit: number): Promise<number> {
  const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86_400_000);
  const stale = await db
    .select({ id: tables.sourceDelivery.id })
    .from(tables.sourceDelivery)
    .where(lt(tables.sourceDelivery.receivedAt, cutoff))
    .limit(limit);
  for (const row of stale) await db.delete(tables.sourceDelivery).where(eq(tables.sourceDelivery.id, row.id));
  return stale.length;
}

export async function rewrapSources(db: Db, limit: number): Promise<number> {
  const current = currentKeyVersion();
  const rows = await db
    .select()
    .from(tables.source)
    .where(and(lt(tables.source.keyVersion, current), isNull(tables.source.deletedAt)))
    .limit(limit);
  for (const row of rows) {
    if (!row.secretCiphertext || !row.secretIv || !row.dekCiphertext || !row.dekIv || row.keyVersion === null)
      continue;
    const next = await rewrapSecret(
      {
        secretCiphertext: row.secretCiphertext,
        secretIv: row.secretIv,
        dekCiphertext: row.dekCiphertext,
        dekIv: row.dekIv,
        keyVersion: row.keyVersion,
      },
      sealingContext(row.tenantId, row.id)
    );
    await db
      .update(tables.source)
      .set({ dekCiphertext: next.dekCiphertext, dekIv: next.dekIv, keyVersion: next.keyVersion })
      .where(eq(tables.source.id, row.id));
  }
  return rows.length;
}
