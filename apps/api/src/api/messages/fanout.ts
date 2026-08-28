import { failDeliveriesImmediately, finalizeMessageIfComplete } from '@buzzkit/api/api/deliveries/index';
import { STALLED_FANOUT_MINUTES } from '@buzzkit/api/api/deliveries/policy';
import { findSegmentVersionById, listSegmentMembers } from '@buzzkit/api/api/segments/index';
import { type Channel, type Topic, topicDefault } from '@buzzkit/api/api/topics/index';
import { trace } from '@buzzkit/api/libs/telemetry';
import { type ProviderName, PUSH_PROVIDER_BY_PLATFORM } from '@buzzkit/api/providers/index';
import { and, asc, type Db, eq, gt, inArray, isNull, lt, ne, sql, tables } from '@buzzkit/database';
import type { Expression } from 'buzzkit/expressions';
import { FANOUT_PAGE_SIZE, SUBSCRIBER_TIMEZONE } from './constants';
import { enqueueDeliveries, enqueueFanout } from './enqueue';
import { fallbackTimezone, timezoneScoped } from './schedule';
import type { Message, MessageSchedule, MessageTargets, TargetPage } from './types';

export type FanoutBatch = { zones?: string[]; final?: boolean };

function zoneCondition(message: Message, zones: string[]) {
  const attribute = sql`${tables.subscriber.attributes}->>'$timezone'`;
  const fallback = fallbackTimezone(message.schedule as MessageSchedule);
  return zones.includes(fallback)
    ? sql`(${attribute} in ${zones} or ${attribute} is null)`
    : sql`${attribute} in ${zones}`;
}

async function resolveTargetPage(
  db: Db,
  message: Message,
  topic: Topic | null,
  afterId: number,
  zones?: string[]
): Promise<TargetPage> {
  const targets = message.targets as MessageTargets;
  const channel = message.channel as Channel;

  const conditions = [
    eq(tables.subscription.tenantId, message.tenantId),
    eq(tables.subscriber.tenantId, message.tenantId),
    eq(tables.subscription.channel, channel),
    eq(tables.subscription.enabled, true),
    eq(tables.subscription.status, 'active'),
    isNull(tables.subscription.deletedAt),
    isNull(tables.subscriber.deletedAt),
    gt(tables.subscription.id, afterId),
  ];

  if (targets.to) {
    conditions.push(inArray(tables.subscriber.externalId, targets.to));
  }
  if (zones) {
    conditions.push(zoneCondition(message, zones));
  }

  let query = db
    .select({
      subscriptionId: tables.subscription.id,
      subscriberId: tables.subscriber.id,
      platform: tables.subscription.platform,
    })
    .from(tables.subscription)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscription.subscriberId))
    .$dynamic();

  if (topic) {
    const channelDefault = topicDefault(topic, channel);
    query = query.leftJoin(
      tables.subscriberPreference,
      and(
        eq(tables.subscriberPreference.subscriberId, tables.subscriber.id),
        eq(tables.subscriberPreference.topicId, topic.id),
        eq(tables.subscriberPreference.channel, channel)
      )
    );
    conditions.push(sql`coalesce(${tables.subscriberPreference.optedIn}, ${channelDefault}) = true`);
  }

  const rows = await query
    .where(and(...conditions))
    .orderBy(asc(tables.subscription.id))
    .limit(FANOUT_PAGE_SIZE);
  return {
    rows,
    cursor: rows[rows.length - 1]?.subscriptionId ?? afterId,
    done: rows.length < FANOUT_PAGE_SIZE,
  };
}

async function resolveSegmentPage(
  db: Db,
  message: Message,
  topic: Topic | null,
  afterSubscriberId: number,
  zones?: string[]
): Promise<TargetPage> {
  const targets = message.targets as MessageTargets;
  const version = targets.segmentVersionId
    ? await findSegmentVersionById(db, targets.segmentVersionId)
    : null;
  const audience = targets.where ?? (version?.expression as Expression | undefined);
  if (!audience) return { rows: [], cursor: afterSubscriberId, done: true };
  const expression = zones
    ? timezoneScoped(audience, zones, fallbackTimezone(message.schedule as MessageSchedule))
    : audience;
  const members = await listSegmentMembers(message.tenantId, expression, {
    afterSubscriberId,
    limit: FANOUT_PAGE_SIZE,
  });
  if (members.items.length === 0) return { rows: [], cursor: afterSubscriberId, done: true };
  const channel = message.channel as Channel;
  const subscriberIds = members.items.map((member) => member.subscriber_id);

  const conditions = [
    eq(tables.subscription.tenantId, message.tenantId),
    eq(tables.subscription.channel, channel),
    eq(tables.subscription.enabled, true),
    eq(tables.subscription.status, 'active'),
    isNull(tables.subscription.deletedAt),
    isNull(tables.subscriber.deletedAt),
    inArray(tables.subscriber.id, subscriberIds),
  ];
  let query = db
    .select({
      subscriptionId: tables.subscription.id,
      subscriberId: tables.subscriber.id,
      platform: tables.subscription.platform,
    })
    .from(tables.subscription)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscription.subscriberId))
    .$dynamic();
  if (topic) {
    const channelDefault = topicDefault(topic, channel);
    query = query.leftJoin(
      tables.subscriberPreference,
      and(
        eq(tables.subscriberPreference.subscriberId, tables.subscriber.id),
        eq(tables.subscriberPreference.topicId, topic.id),
        eq(tables.subscriberPreference.channel, channel)
      )
    );
    conditions.push(sql`coalesce(${tables.subscriberPreference.optedIn}, ${channelDefault}) = true`);
  }
  const rows = await query
    .where(and(...conditions))
    .orderBy(asc(tables.subscriber.id), asc(tables.subscription.id));
  return { rows, cursor: members.items[members.items.length - 1]!.subscriber_id, done: !members.hasMore };
}

async function providerHasCredential(db: Db, tenantId: number, provider: ProviderName): Promise<boolean> {
  const [row] = await db
    .select({ id: tables.credential.id })
    .from(tables.credential)
    .where(
      and(
        eq(tables.credential.tenantId, tenantId),
        eq(tables.credential.provider, provider),
        ne(tables.credential.status, 'invalid'),
        isNull(tables.credential.deletedAt)
      )
    )
    .limit(1);
  return row !== undefined;
}

export async function completeFanout(db: Db, messageId: number): Promise<void> {
  await db
    .update(tables.message)
    .set({ fanoutCompletedAt: new Date() })
    .where(and(eq(tables.message.id, messageId), isNull(tables.message.fanoutCompletedAt)));
  await finalizeMessageIfComplete(db, messageId);
}

async function markZonesDone(db: Db, messageId: number, zones: string[]): Promise<void> {
  await db
    .update(tables.message)
    .set({
      scheduledZones: sql`(select coalesce(jsonb_agg(distinct zone), '[]'::jsonb) from jsonb_array_elements(coalesce(${tables.message.scheduledZones}, '[]'::jsonb) || ${JSON.stringify(zones)}::jsonb) as zone)`,
    })
    .where(eq(tables.message.id, messageId));
}

async function finishBatch(db: Db, messageId: number, batch: FanoutBatch): Promise<void> {
  if (!batch.zones) {
    await completeFanout(db, messageId);
    return;
  }
  await markZonesDone(db, messageId, batch.zones);
  if (batch.final) await completeFanout(db, messageId);
}

export async function fanoutPage(
  db: Db,
  messageId: number,
  afterId: number,
  batch: FanoutBatch = {}
): Promise<void> {
  return await trace('messages.fanoutPage', async (t) => {
    t.set('message.id', messageId);
    t.set('fanout.afterId', afterId);
    if (batch.zones) t.set('fanout.zones', batch.zones.length);
    return fanoutPageInner(db, messageId, afterId, batch);
  });
}

async function fanoutPageInner(
  db: Db,
  messageId: number,
  afterId: number,
  batch: FanoutBatch
): Promise<void> {
  const [message] = await db.select().from(tables.message).where(eq(tables.message.id, messageId));
  if (!message || message.fanoutCompletedAt) return;
  if (!batch.zones && afterId < message.fanoutCursor) return;

  if (message.status === 'queued' || message.status === 'scheduled') {
    await db.update(tables.message).set({ status: 'processing' }).where(eq(tables.message.id, message.id));
  }

  const targets = message.targets as MessageTargets;
  const topic =
    targets.topic && message.topicId
      ? ((
          await db
            .select()
            .from(tables.topic)
            .where(
              and(
                eq(tables.topic.id, message.topicId),
                eq(tables.topic.tenantId, message.tenantId),
                isNull(tables.topic.deletedAt)
              )
            )
        )[0] ?? null)
      : null;

  if (targets.topic && !topic) {
    await completeFanout(db, message.id);
    return;
  }

  const page =
    targets.segment || targets.where
      ? await resolveSegmentPage(db, message, topic, afterId, batch.zones)
      : await resolveTargetPage(db, message, topic, afterId, batch.zones);

  if (page.rows.length === 0 && page.done) {
    await finishBatch(db, message.id, batch);
    return;
  }

  const availability = new Map<ProviderName, boolean>();
  const rows = [];
  for (const target of page.rows) {
    const provider: ProviderName = target.platform ? PUSH_PROVIDER_BY_PLATFORM[target.platform] : 'apns';
    if (!availability.has(provider)) {
      availability.set(provider, await providerHasCredential(db, message.tenantId, provider));
    }
    rows.push({
      tenantId: message.tenantId,
      messageId: message.id,
      subscriberId: target.subscriberId,
      subscriptionId: target.subscriptionId,
      channel: message.channel,
      provider,
      status: 'pending' as const,
    });
  }

  const inserted =
    rows.length === 0
      ? []
      : await db
          .insert(tables.delivery)
          .values(rows)
          .onConflictDoNothing({ target: [tables.delivery.messageId, tables.delivery.subscriptionId] })
          .returning({ id: tables.delivery.id, provider: tables.delivery.provider });

  const withoutCredential = inserted.filter((row) => !availability.get(row.provider as ProviderName));
  const failed = await failDeliveriesImmediately(
    db,
    withoutCredential.map((row) => row.id),
    'no_credential',
    'No credential configured for this provider'
  );

  const lastId = page.cursor;
  await db
    .update(tables.message)
    .set({
      total: sql`${tables.message.total} + ${inserted.length}`,
      failed: sql`${tables.message.failed} + ${failed}`,
      ...(batch.zones ? {} : { fanoutCursor: lastId }),
    })
    .where(eq(tables.message.id, message.id));

  await enqueueDeliveries(
    inserted
      .filter((row) => availability.get(row.provider as ProviderName))
      .map((row) => ({ deliveryId: row.id, attempt: 1 }))
  );

  if (page.done) {
    await finishBatch(db, message.id, batch);
    return;
  }

  await enqueueFanout(message.id, lastId, batch);
}

export async function listStalledFanouts(
  db: Db,
  limit: number
): Promise<Array<{ id: number; cursor: number }>> {
  const cutoff = new Date(Date.now() - STALLED_FANOUT_MINUTES * 60 * 1000);
  return await db
    .select({ id: tables.message.id, cursor: tables.message.fanoutCursor })
    .from(tables.message)
    .where(
      and(
        inArray(tables.message.status, ['queued', 'processing']),
        isNull(tables.message.fanoutCompletedAt),
        sql`(${tables.message.schedule} is null or ${tables.message.schedule}->>'timezone' <> ${SUBSCRIBER_TIMEZONE})`,
        lt(tables.message.updatedAt, cutoff)
      )
    )
    .orderBy(asc(tables.message.updatedAt))
    .limit(limit);
}
