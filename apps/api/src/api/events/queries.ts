import type { Subscriber } from '@buzzkit/api/api/subscribers/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  formatClickHouseDateTime,
  formatClickHouseTime,
  parseClickHouseTime,
  tinybird,
} from '@buzzkit/api/libs/tinybird';
import { VOLUME_BUCKET_SECONDS, VOLUME_RANGE_HOURS } from './constants';
import { serializeEvent, serializeEventName } from './serialize';
import type { EventCursor, EventPage, EventRow, EventVolumeRange } from './types';

export function encodeEventCursor(row: Pick<EventRow, 'received_at' | 'id'>): string {
  return `${parseClickHouseTime(row.received_at)}_${row.id}`;
}

export function resolveEventCursor(cursor: string | undefined): EventCursor | undefined {
  if (cursor === undefined) return undefined;
  const split = cursor.indexOf('_');
  const receivedAt = split === -1 ? cursor : cursor.slice(0, split);
  const id = split === -1 ? undefined : cursor.slice(split + 1);
  if (Number.isNaN(new Date(receivedAt).getTime()) || (id !== undefined && !/^evt_[0-9a-f-]{36}$/.test(id))) {
    throw new BadRequestError('Invalid cursor', { code: 'invalid_cursor', param: 'cursor' });
  }
  return { receivedAt: new Date(receivedAt).toISOString(), id };
}

export async function listEventNames(tenantId: number) {
  const result = await trace('events.listNames', async () =>
    (await tinybird()).eventCatalog.query({ tenant_id: tenantId })
  );
  return result.data.map(serializeEventName);
}

export async function listRecentEvents(
  tenantId: number,
  options: { name?: string; source?: string; before?: EventCursor; after?: EventCursor; limit: number }
): Promise<EventPage> {
  const result = await trace('events.listRecent', async () =>
    (await tinybird()).eventRecent.query({
      tenant_id: tenantId,
      name: options.name,
      source: options.source,
      before: options.before ? formatClickHouseTime(options.before.receivedAt) : undefined,
      before_id: options.before?.id,
      after: options.after ? formatClickHouseTime(options.after.receivedAt) : undefined,
      after_id: options.after?.id,
      limit: options.limit + 1,
    })
  );
  return toPage(result.data, options.limit, encodeEventCursor);
}

export async function listEventVolume(tenantId: number, range: EventVolumeRange, name?: string) {
  const end = new Date();
  const start = new Date(end.getTime() - VOLUME_RANGE_HOURS[range] * 3_600_000);
  const result = await trace('events.listVolume', async () =>
    (await tinybird()).eventVolume.query({
      tenant_id: tenantId,
      name,
      start: formatClickHouseDateTime(start.toISOString()),
      end: formatClickHouseDateTime(end.toISOString()),
      bucket_seconds: VOLUME_BUCKET_SECONDS[range],
    })
  );
  return {
    range,
    bucketSeconds: VOLUME_BUCKET_SECONDS[range],
    from: start.toISOString(),
    to: end.toISOString(),
    buckets: result.data.map((row) => ({
      at: parseClickHouseTime(row.bucket),
      count: row.count,
      subscribers: row.subscribers,
    })),
  };
}

export async function listSubscriberTimeline(
  tenantId: number,
  subscriber: Pick<Subscriber, 'id' | 'externalId'>,
  options: { beforeSequence?: number; limit: number }
): Promise<EventPage> {
  const wanted = options.limit + 1;
  const head = await listTimelineHead(tenantId, subscriber, wanted, options.beforeSequence);
  const oldestHeld = head[head.length - 1]?.sequence ?? options.beforeSequence;
  const rows =
    head.length < wanted && oldestHeld !== undefined && oldestHeld > 1
      ? [...head, ...(await listTimelineTail(tenantId, subscriber, oldestHeld, wanted - head.length))]
      : head;
  return toPage(
    rows.map((row) => ({ ...row, external_id: subscriber.externalId })),
    options.limit,
    (row) => String(row.sequence)
  );
}

async function listTimelineHead(
  tenantId: number,
  subscriber: Pick<Subscriber, 'id'>,
  limit: number,
  beforeSequence?: number
) {
  return await trace('events.listTimelineHead', async () => {
    const actor = await subscriberActor(tenantId, subscriber.id);
    return await actor.listRecent(limit, beforeSequence);
  });
}

async function listTimelineTail(
  tenantId: number,
  subscriber: Pick<Subscriber, 'id'>,
  beforeSequence: number,
  limit: number
) {
  const result = await trace('events.listTimelineTail', async () =>
    (await tinybird()).subscriberTimeline.query({
      tenant_id: tenantId,
      subscriber_id: subscriber.id,
      before_sequence: beforeSequence,
      limit,
    })
  );
  return result.data;
}

function toPage(rows: EventRow[], limit: number, cursorOf: (row: EventRow) => string): EventPage {
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  return {
    items: page.map(serializeEvent),
    hasMore,
    nextCursor: hasMore && last ? cursorOf(last) : null,
  };
}
