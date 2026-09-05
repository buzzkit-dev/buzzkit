import type { ActorEventInput, ActorIngestOutcome } from '@buzzkit/api/actor/types';
import { recordDeliveryReceipt } from '@buzzkit/api/api/deliveries/index';
import { type Subscriber, upsertSubscriber } from '@buzzkit/api/api/subscribers/index';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { currentTraceparent, trace } from '@buzzkit/api/libs/telemetry';
import { runConcurrently } from '@buzzkit/api/utils/concurrency';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import { uuidv7 } from '@buzzkit/api/utils/uuid';
import type { Db } from '@buzzkit/database';
import { assertEventNameAllowed, reservedEventName } from './catalog';
import { INGEST_CONCURRENCY, MAX_EVENT_AGE_MS, MAX_EVENT_DATA_BYTES, MAX_EVENT_SKEW_MS } from './constants';
import type { EventInput, EventSource, SystemEvent, TrackedEvent } from './types';

type SubscriberRef = Pick<Subscriber, 'id' | 'externalId'>;

export function resolveTimestamp(value: string | undefined, now: Date): string {
  if (!value) return now.toISOString();
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestError('timestamp must be an ISO 8601 date-time', {
      code: 'invalid_timestamp',
      param: 'timestamp',
    });
  }
  if (timestamp.getTime() < now.getTime() - MAX_EVENT_AGE_MS) {
    throw new BadRequestError('timestamp may not be more than 7 days in the past', {
      code: 'invalid_timestamp',
      param: 'timestamp',
    });
  }
  if (timestamp.getTime() > now.getTime() + MAX_EVENT_SKEW_MS) {
    throw new BadRequestError('timestamp may not be in the future', {
      code: 'invalid_timestamp',
      param: 'timestamp',
    });
  }

  return timestamp.toISOString();
}

export async function trackEvents(
  db: Db,
  tenant: Tenant,
  input: {
    source: EventSource;
    events: EventInput[];
    verifiedNow?: boolean;
    systemAttributes?: Record<string, string>;
  }
): Promise<TrackedEvent[]> {
  return await trace(
    'events.track',
    { 'events.count': input.events.length, 'events.source': input.source },
    async () => {
      const now = new Date();
      const prepared = input.events.map((event) => {
        return {
          externalId: event.externalId,
          actor: resolveTrackedEvent(event, input.source, now),
        };
      });

      const byExternalId = new Map<string, ActorEventInput[]>();
      for (const entry of prepared) {
        byExternalId.set(entry.externalId, [...(byExternalId.get(entry.externalId) ?? []), entry.actor]);
      }

      const outcomes = new Map<ActorEventInput, ActorIngestOutcome>();
      const failures: unknown[] = [];
      await runConcurrently([...byExternalId], INGEST_CONCURRENCY, async ([externalId, events]) => {
        try {
          const { subscriber, created } = await upsertSubscriber(db, tenant.id, externalId, {
            verifiedNow: input.verifiedNow,
            systemAttributes: input.systemAttributes,
          });
          if (created) {
            events.unshift(
              resolveSystemEvent(
                {
                  name: 'subscriber.created',
                  data: { externalId, attributes: subscriberAttributes(subscriber) },
                },
                now
              )
            );
          }
          const results = await ingestEvents(tenant.id, subscriber, events);
          for (const [index, event] of events.entries()) {
            outcomes.set(event, results[index]!);
          }
          await promoteReceipts(db, tenant.id, subscriber, events);
        } catch (error) {
          failures.push(error);
        }
      });
      if (failures.length > 0) throw failures[0];

      return prepared.map(({ externalId, actor }) => {
        const outcome = outcomes.get(actor)!;

        return {
          id: outcome.id,
          sequence: outcome.sequence,
          externalId,
          name: actor.name,
          source: input.source,
          timestamp: actor.timestamp,
          receivedAt: actor.receivedAt,
          data: actor.data,
          status: outcome.status,
        };
      });
    }
  );
}

export async function recordSystemEvents(
  tenantId: number,
  subscriber: SubscriberRef,
  events: SystemEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();
  await ingestEvents(
    tenantId,
    subscriber,
    events.map((event) => resolveSystemEvent(event, now))
  );
}

const DELIVERED_EVENT = reservedEventName('notification.delivered');

async function promoteReceipts(
  db: Db,
  tenantId: number,
  subscriber: SubscriberRef,
  events: ActorEventInput[]
): Promise<void> {
  const messageSqids = new Set(
    events
      .filter((event) => event.name === DELIVERED_EVENT)
      .map((event) => event.messageId ?? event.data.messageId)
      .filter(
        (messageSqid): messageSqid is string => typeof messageSqid === 'string' && messageSqid.length > 0
      )
  );

  for (const messageSqid of messageSqids) {
    await recordDeliveryReceipt(db, tenantId, {
      messageSqid,
      subscriberId: subscriber.id,
      receivedAt: new Date(),
    });
  }
}

export function subscriberAttributes(subscriber: Pick<Subscriber, 'attributes'>): Record<string, unknown> {
  return (subscriber.attributes ?? {}) as Record<string, unknown>;
}

function resolveTrackedEvent(event: EventInput, source: EventSource, now: Date): ActorEventInput {
  assertEventNameAllowed(event.name, source);
  const data = event.data ?? {};
  assertJsonSize(data, MAX_EVENT_DATA_BYTES, 'data must serialize to 8KB or less', {
    code: 'event_data_too_large',
    param: 'data',
  });

  return {
    id: `evt_${uuidv7(now.getTime())}`,
    idempotencyKey: event.id ?? null,
    name: event.name,
    source,
    timestamp: resolveTimestamp(event.timestamp, now),
    receivedAt: now.toISOString(),
    data,
  };
}

function resolveSystemEvent(event: SystemEvent, now: Date): ActorEventInput {
  return {
    id: `evt_${uuidv7(now.getTime())}`,
    idempotencyKey: null,
    name: reservedEventName(event.name),
    source: 'system',
    timestamp: event.timestamp ?? now.toISOString(),
    receivedAt: now.toISOString(),
    data: event.data,
  };
}

async function ingestEvents(
  tenantId: number,
  subscriber: SubscriberRef,
  events: ActorEventInput[]
): Promise<ActorIngestOutcome[]> {
  return await trace('events.ingest', { 'events.count': events.length }, async () => {
    const actor = await subscriberActor(tenantId, subscriber.id);

    return await actor.ingest({
      tenantId,
      subscriberId: subscriber.id,
      externalId: subscriber.externalId,
      events,
      traceparent: currentTraceparent(),
    });
  });
}
