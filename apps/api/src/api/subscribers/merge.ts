import { subscriberActor } from '@buzzkit/api/libs/actor';
import { countRows } from '@buzzkit/api/libs/database';
import { ConflictError, UnavailableError } from '@buzzkit/api/libs/error';
import { type Span, trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, isNull, sql, type Tx, tables } from '@buzzkit/database';
import { recordSubscriberAlias, repointSubscriberAliases } from './aliases';
import { ANONYMOUS_ID_PREFIX } from './constants';
import { selectSubscriberByExternalId } from './profile';
import type { Subscriber, SubscriberAliasLink, SubscriberAliasSource, SubscriberMerge } from './types';

export function isAnonymousId(externalId: string): boolean {
  return externalId.startsWith(ANONYMOUS_ID_PREFIX);
}

export function assertAnonymousSource(source: Subscriber): void {
  if (!isAnonymousId(source.externalId)) {
    throw new ConflictError('An app can only merge the anonymous id it was using', {
      code: 'merge_source_identified',
      param: 'anonymousId',
    });
  }
  if (source.identityVerifiedAt !== null) {
    throw new ConflictError('A verified subscriber cannot be merged by an app', {
      code: 'merge_source_verified',
      param: 'anonymousId',
    });
  }
}

async function renameSubscriber(db: Db, source: Subscriber, externalId: string): Promise<Subscriber> {
  return await db.transaction(async (tx) => {
    const [renamed] = await tx
      .update(tables.subscriber)
      .set({ externalId, updatedAt: new Date() })
      .where(eq(tables.subscriber.id, source.id))
      .returning();

    await recordSubscriberAlias(tx, source.tenantId, {
      subscriberId: source.id,
      externalId: source.externalId,
      source: 'system',
    });

    return renamed!;
  });
}

async function movePreferences(tx: Tx, source: Subscriber, target: Subscriber): Promise<number> {
  const owned = await tx
    .select()
    .from(tables.subscriberPreference)
    .where(eq(tables.subscriberPreference.subscriberId, source.id));
  if (owned.length === 0) return 0;

  await tx
    .insert(tables.subscriberPreference)
    .values(
      owned.map((preference) => ({
        tenantId: preference.tenantId,
        subscriberId: target.id,
        topicId: preference.topicId,
        channel: preference.channel,
        optedIn: preference.optedIn,
        updatedAt: preference.updatedAt,
      }))
    )
    .onConflictDoUpdate({
      target: [
        tables.subscriberPreference.subscriberId,
        tables.subscriberPreference.topicId,
        tables.subscriberPreference.channel,
      ],
      set: {
        optedIn: sql`excluded.opted_in`,
        updatedAt: sql`excluded.updated_at`,
      },
      setWhere: sql`${tables.subscriberPreference.updatedAt} < excluded.updated_at`,
    });

  await tx.delete(tables.subscriberPreference).where(eq(tables.subscriberPreference.subscriberId, source.id));

  return owned.length;
}

function liveActivityKey(row: { kind: string; activityId: string | null; attributesType: string }): string {
  return row.kind === 'activity' ? `activity:${row.activityId}` : `start:${row.attributesType}`;
}

async function moveLiveActivities(tx: Tx, source: Subscriber, target: Subscriber, now: Date) {
  const owned = await tx
    .select()
    .from(tables.liveActivity)
    .where(and(eq(tables.liveActivity.subscriberId, source.id), isNull(tables.liveActivity.deletedAt)));
  if (owned.length === 0) return { moved: 0, superseded: 0 };

  const held = await tx
    .select()
    .from(tables.liveActivity)
    .where(and(eq(tables.liveActivity.subscriberId, target.id), isNull(tables.liveActivity.deletedAt)));
  const taken = new Set(held.map(liveActivityKey));

  const superseded = owned.filter((row) => taken.has(liveActivityKey(row)));
  const movable = owned.filter((row) => !taken.has(liveActivityKey(row)));

  for (const row of superseded) {
    await tx.update(tables.liveActivity).set({ deletedAt: now }).where(eq(tables.liveActivity.id, row.id));
  }
  for (const row of movable) {
    await tx
      .update(tables.liveActivity)
      .set({ subscriberId: target.id, updatedAt: now })
      .where(eq(tables.liveActivity.id, row.id));
  }

  return { moved: movable.length, superseded: superseded.length };
}

async function moveHistory(tenantId: number, source: Subscriber, target: Subscriber, span: Span) {
  const origin = await subscriberActor(tenantId, source.id);
  const history = await origin.exportHistory();
  span.set('merge.history.truncated', history.truncated);

  const destination = await subscriberActor(tenantId, target.id);
  const outcome = await destination.ingestHistory({
    tenantId,
    subscriberId: target.id,
    externalId: target.externalId,
    from: source.id,
    ...history,
  });

  if (outcome.pending) {
    throw new UnavailableError('The event history could not be moved yet, retry the merge', {
      code: 'merge_history_pending',
    });
  }

  span.set('merge.history.events', outcome.events);
  return outcome;
}

async function cancelSourceRuns(tenantId: number, source: Subscriber): Promise<number> {
  const origin = await subscriberActor(tenantId, source.id);
  const canceled = await origin.cancelLiveRuns('subscriber_merged');
  return canceled.length;
}

async function absorbSubscriber(
  db: Db,
  span: Span,
  source: Subscriber,
  target: Subscriber,
  aliasSource: SubscriberAliasSource
): Promise<Subscriber> {
  span.set('merge.runs.canceled', await cancelSourceRuns(source.tenantId, source));

  await moveHistory(source.tenantId, source, target, span);

  const now = new Date();
  const sourceAttributes = JSON.stringify(source.attributes as Record<string, unknown>);

  return await db.transaction(async (tx) => {
    const subscriptions = await tx
      .update(tables.subscription)
      .set({ subscriberId: target.id, updatedAt: now })
      .where(and(eq(tables.subscription.subscriberId, source.id), isNull(tables.subscription.deletedAt)))
      .returning({ id: tables.subscription.id });

    const preferences = await movePreferences(tx, source, target);
    const activities = await moveLiveActivities(tx, source, target, now);

    const deliveries = await countRows(tx, tables.delivery, eq(tables.delivery.subscriberId, source.id));
    await tx
      .update(tables.delivery)
      .set({ subscriberId: target.id })
      .where(eq(tables.delivery.subscriberId, source.id));

    const [merged] = await tx
      .update(tables.subscriber)
      .set({
        attributes: sql`${sourceAttributes}::jsonb || ${tables.subscriber.attributes}`,
        updatedAt: now,
      })
      .where(eq(tables.subscriber.id, target.id))
      .returning();

    await repointSubscriberAliases(tx, source, target);
    await tx.update(tables.subscriber).set({ deletedAt: now }).where(eq(tables.subscriber.id, source.id));
    await recordSubscriberAlias(tx, source.tenantId, {
      subscriberId: target.id,
      externalId: source.externalId,
      source: aliasSource,
    });

    span.set('merge.subscriptions', subscriptions.length);
    span.set('merge.preferences', preferences);
    span.set('merge.liveActivities', activities.moved);
    span.set('merge.liveActivities.superseded', activities.superseded);
    span.set('merge.deliveries', deliveries);

    return merged!;
  });
}

export async function mergeAnonymousSubscriber(
  db: Db,
  tenantId: number,
  options: { anonymousId: string; externalId: string }
): Promise<SubscriberMerge | null> {
  if (options.anonymousId === options.externalId) return null;

  return await trace('subscribers.merge', async (span) => {
    const source = await selectSubscriberByExternalId(db, tenantId, options.anonymousId);
    if (!source || source.externalId !== options.anonymousId) {
      span.set('merge.outcome', 'none');
      return null;
    }
    assertAnonymousSource(source);

    span.set('tenant.id', tenantId);
    span.set('subscriber.id', source.id);

    const target = await selectSubscriberByExternalId(db, tenantId, options.externalId);
    if (!target) {
      span.set('merge.outcome', 'renamed');
      return { subscriber: await renameSubscriber(db, source, options.externalId), from: source.externalId };
    }

    span.set('merge.outcome', 'absorbed');
    return {
      subscriber: await absorbSubscriber(db, span, source, target, 'system'),
      from: source.externalId,
    };
  });
}

export async function linkSubscriberAlias(
  db: Db,
  tenantId: number,
  input: { subscriber: Subscriber; alias: string }
): Promise<SubscriberAliasLink> {
  if (input.alias === input.subscriber.externalId) {
    throw new ConflictError('That id is already this subscriber', {
      code: 'alias_is_primary',
      param: 'externalId',
    });
  }

  return await trace('subscribers.link', async (span) => {
    span.set('tenant.id', tenantId);
    span.set('subscriber.id', input.subscriber.id);

    const owner = await selectSubscriberByExternalId(db, tenantId, input.alias);
    if (owner && owner.id !== input.subscriber.id) {
      span.set('link.outcome', 'merged');
      return {
        subscriber: await absorbSubscriber(db, span, owner, input.subscriber, 'manual'),
        alias: input.alias,
        merged: true,
      };
    }

    if (!owner) {
      await recordSubscriberAlias(db, tenantId, {
        subscriberId: input.subscriber.id,
        externalId: input.alias,
        source: 'manual',
      });
    }

    span.set('link.outcome', owner ? 'unchanged' : 'linked');
    return { subscriber: input.subscriber, alias: input.alias, merged: false };
  });
}
