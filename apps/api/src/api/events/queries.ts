import type { Subscriber } from '@buzzkit/api/api/subscribers/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  formatClickHouseDateTime,
  formatClickHouseTime,
  parseClickHouseTime,
  tinybird,
} from '@buzzkit/api/libs/tinybird';
import { VOLUME_BUCKET_SECONDS, VOLUME_RANGE_HOURS } from './constants';
import { serializeEvent, serializeEventName } from './serialize';
import type { EventPage, EventRow, EventVolumeRange } from './types';

export async function listEventNames(tenantId: number) {
  const result = await trace('events.listNames', async () =>
    (await tinybird()).eventCatalog.query({ tenant_id: tenantId })
  );
  return result.data.map(serializeEventName);
}

export async function listRecentEvents(
  tenantId: number,
  options: { name?: string; source?: string; before?: string; after?: string; limit: number }
): Promise<EventPage> {
  const result = await trace('events.listRecent', async () =>
    (await tinybird()).eventRecent.query({
      tenant_id: tenantId,
      name: options.name,
      source: options.source,
      before: options.before ? formatClickHouseTime(options.before) : undefined,
      after: options.after ? formatClickHouseTime(options.after) : undefined,
      limit: options.limit + 1,
    })
  );
  return toPage(result.data, options.limit, (row) => parseClickHouseTime(row.received_at));
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
  const rows =
    options.beforeSequence === undefined
      ? await listTimelineHead(tenantId, subscriber, options.limit + 1)
      : await listTimelineTail(tenantId, subscriber, options.beforeSequence, options.limit + 1);
  return toPage(
    rows.map((row) => ({ ...row, external_id: subscriber.externalId })),
    options.limit,
    (row) => String(row.sequence)
  );
}

async function listTimelineHead(tenantId: number, subscriber: Pick<Subscriber, 'id'>, limit: number) {
  return await trace('events.listTimelineHead', async () => {
    const actor = await subscriberActor(tenantId, subscriber.id);
    return await actor.listRecent(limit);
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
