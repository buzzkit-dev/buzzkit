import { trackEvents } from '@buzzkit/api/api/events/track';
import { findTenantById } from '@buzzkit/api/api/tenants/index';
import { ApiError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, isNull, sql, tables } from '@buzzkit/database';
import {
  type DropReason,
  detectProvider,
  type MappedEvent,
  mapPayload,
  readPath,
  SOURCE_PRESETS,
  type SourceMapping,
  suggestMapping,
  type Verification,
} from '@buzzkit/schema/sources';
import { assertMapping } from './schemas';
import { resolveSecret } from './secrets';
import type { IngestResult, Source, SourceDelivery } from './types';
import { type Rejection, verifyDelivery } from './verify';

type Resolved = { subscriberId: number; externalId: string };

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

function subscriberPhrase(event: MappedEvent): string {
  return 'externalId' in event.subscriber
    ? event.subscriber.externalId
    : `${event.subscriber.attribute} = ${event.subscriber.value}`;
}

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

function parsePayload(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
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

    const secret = await resolveSecret(source);
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
    if (rejection) {
      return finish(401, {
        outcome: 'rejected',
        reason: rejection.reason,
        detail: rejection.detail,
        payload,
      });
    }
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
