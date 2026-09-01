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
import { clampLimit, resolveNumericCursor, toPageBy } from '@buzzkit/api/utils/pagination';
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
  options: {
    name?: string;
    source?: string;
    provider?: string;
    cursor?: string;
    after?: string;
    afterId?: string;
    limit?: number;
  } = {}
): Promise<EventPage> {
  const limit = clampLimit(options.limit);
  const before = resolveEventCursor(options.cursor);
  const after = options.after ? { receivedAt: options.after, id: options.afterId } : undefined;

  const result = await trace('events.listRecent', async () => {
    return await (await tinybird()).eventRecent.query({
      tenant_id: tenantId,
      name: options.name,
      source: options.source,
      provider: options.provider || undefined,
      before: before ? formatClickHouseTime(before.receivedAt) : undefined,
      before_id: before?.id,
      after: after ? formatClickHouseTime(after.receivedAt) : undefined,
      after_id: after?.id,
      limit: limit + 1,
    });
  });

  return toEventPage(result.data, limit, encodeEventCursor);
}

export async function listEventVolume(tenantId: number, range: EventVolumeRange, name?: string) {
  const end = new Date();
  const start = new Date(end.getTime() - VOLUME_RANGE_HOURS[range] * 3_600_000);
  const result = await trace('events.listVolume', async () => {
    return (await tinybird()).eventVolume.query({
      tenant_id: tenantId,
      name,
      start: formatClickHouseDateTime(start.toISOString()),
      end: formatClickHouseDateTime(end.toISOString()),
      bucket_seconds: VOLUME_BUCKET_SECONDS[range],
    });
  });

  return {
    range,
    bucketSeconds: VOLUME_BUCKET_SECONDS[range],
    from: start.toISOString(),
    to: end.toISOString(),
    buckets: result.data.map((row) => {
      return {
        at: parseClickHouseTime(row.bucket),
        count: row.count,
        subscribers: row.subscribers,
      };
    }),
  };
}

type TimelineFilter = { name?: string; source?: string; provider?: string };

function rowProvider(row: EventRow): string | null {
  try {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const provider = (data as Record<string, unknown> | null)?.$provider;
    return typeof provider === 'string' ? provider : null;
  } catch {
    return null;
  }
}

function matchesTimelineFilter(row: EventRow, filter: TimelineFilter): boolean {
  if (filter.name && row.name !== filter.name) return false;
  if (filter.source && row.source !== filter.source) return false;
  if (filter.provider && (row.source !== 'webhook' || rowProvider(row) !== filter.provider)) return false;
  return true;
}

async function rawTimelinePage(
  tenantId: number,
  subscriber: Pick<Subscriber, 'id' | 'externalId'>,
  wanted: number,
  beforeSequence?: number
): Promise<EventRow[]> {
  const head = await listTimelineHead(tenantId, subscriber, wanted, beforeSequence);
  const oldestHeld = head.at(-1)?.sequence ?? beforeSequence;
  if (head.length >= wanted || oldestHeld === undefined || oldestHeld <= 1) return head;

  const tail = await listTimelineTail(tenantId, subscriber, oldestHeld, wanted - head.length);

  return [...head, ...tail];
}

export async function listSubscriberTimeline(
  tenantId: number,
  subscriber: Pick<Subscriber, 'id' | 'externalId'>,
  options: { cursor?: string; limit?: number } & TimelineFilter
): Promise<EventPage> {
  const limit = clampLimit(options.limit);
  const beforeSequence = resolveNumericCursor(options.cursor);
  const wanted = limit + 1;
  const filtered = Boolean(options.name || options.source || options.provider);
  if (!filtered) {
    const rows = await rawTimelinePage(tenantId, subscriber, wanted, beforeSequence);
    return toEventPage(
      rows.map((row) => ({ ...row, external_id: subscriber.externalId })),
      limit,
      (row) => String(row.sequence)
    );
  }
  const collected: EventRow[] = [];
  let before = beforeSequence;
  let rawHasMore = true;
  for (let round = 0; round < 4 && collected.length < wanted && rawHasMore; round++) {
    const raw = await rawTimelinePage(tenantId, subscriber, 51, before);
    const scanned = raw.slice(0, 50);
    rawHasMore = raw.length > 50;
    if (scanned.length === 0) break;
    for (const row of scanned) {
      if (matchesTimelineFilter(row, options)) collected.push(row);
      if (collected.length >= wanted) break;
    }
    before = scanned.at(-1)?.sequence;
  }
  const page = collected.slice(0, limit);
  const hasMore = collected.length > limit || rawHasMore;
  const last = page.at(-1);

  return {
    items: page.map((row) => serializeEvent({ ...row, external_id: subscriber.externalId })),
    hasMore,
    nextCursor: hasMore && last ? String(last.sequence) : null,
  };
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
  const result = await trace('events.listTimelineTail', async () => {
    return (await tinybird()).subscriberTimeline.query({
      tenant_id: tenantId,
      subscriber_id: subscriber.id,
      before_sequence: beforeSequence,
      limit,
    });
  });
  return result.data;
}

function toEventPage(rows: EventRow[], limit: number, cursorOf: (row: EventRow) => string): EventPage {
  const page = toPageBy(rows, limit, cursorOf);
  return { ...page, items: page.items.map(serializeEvent) };
}
