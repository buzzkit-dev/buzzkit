import { NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { deepEqual } from '@buzzkit/api/utils/equality';
import { and, type Db, eq, getTableColumns, isNull, sql, tables } from '@buzzkit/database';
import { assertAttributesSize } from './attributes';
import { IDENTITY_REVERIFY_THROTTLE_MS, SYSTEM_ATTRIBUTE_PREFIX } from './constants';
import type { Subscriber, SubscriberInput, Subscription } from './types';

function splitAttributes(attributes: Record<string, unknown>) {
  const custom: Record<string, unknown> = {};
  const system: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    (key.startsWith(SYSTEM_ATTRIBUTE_PREFIX) ? system : custom)[key] = value;
  }
  return { custom, system };
}

function resolveAttributes(
  existing: Subscriber | null,
  input: SubscriberInput
): Record<string, unknown> | undefined {
  if (input.attributes === undefined && input.systemAttributes === undefined) return undefined;

  const current = splitAttributes((existing?.attributes ?? {}) as Record<string, unknown>);
  const custom =
    input.attributes === undefined
      ? current.custom
      : input.mergeAttributes
        ? { ...current.custom, ...input.attributes }
        : input.attributes;

  return {
    ...custom,
    ...current.system,
    ...(input.systemAttributes ?? {}),
  };
}

function isSubscriberCurrent(existing: Subscriber, input: SubscriberInput, now: Date): boolean {
  const attributes = resolveAttributes(existing, input);
  if (attributes !== undefined && !deepEqual(existing.attributes, attributes)) return false;
  if (
    input.verifiedNow &&
    (!existing.identityVerifiedAt ||
      now.getTime() - existing.identityVerifiedAt.getTime() > IDENTITY_REVERIFY_THROTTLE_MS)
  ) {
    return false;
  }
  return true;
}

async function findExistingSubscriber(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber | null> {
  const [subscriber] = await db
    .select()
    .from(tables.subscriber)
    .where(
      and(
        eq(tables.subscriber.tenantId, tenantId),
        eq(tables.subscriber.externalId, externalId),
        isNull(tables.subscriber.deletedAt)
      )
    );
  return subscriber ?? null;
}

export async function findSubscriberByExternalId(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber> {
  const [subscriber] = await trace('subscribers.findByExternalId', async () => {
    return await db
      .select()
      .from(tables.subscriber)
      .where(
        and(
          eq(tables.subscriber.tenantId, tenantId),
          eq(tables.subscriber.externalId, externalId),
          isNull(tables.subscriber.deletedAt)
        )
      );
  });

  if (!subscriber) {
    throw new NotFoundError('Subscriber not found');
  }
  return subscriber;
}

export async function findSubscriberById(db: Db, tenantId: number, id: number): Promise<Subscriber> {
  const [subscriber] = await trace('subscribers.findById', async () => {
    return await db
      .select()
      .from(tables.subscriber)
      .where(
        and(
          eq(tables.subscriber.tenantId, tenantId),
          eq(tables.subscriber.id, id),
          isNull(tables.subscriber.deletedAt)
        )
      );
  });

  if (!subscriber) {
    throw new NotFoundError('Subscriber not found');
  }
  return subscriber;
}

export async function selectSubscriberById(db: Db, tenantId: number, id: number): Promise<Subscriber | null> {
  const [subscriber] = await db
    .select()
    .from(tables.subscriber)
    .where(and(eq(tables.subscriber.tenantId, tenantId), eq(tables.subscriber.id, id)));
  return subscriber ?? null;
}

export async function upsertSubscriber(
  db: Db,
  tenantId: number,
  externalId: string,
  input: SubscriberInput = {}
): Promise<{ subscriber: Subscriber; created: boolean; changed: boolean }> {
  assertAttributesSize(input.attributes);

  return await trace('subscribers.upsert', async (span) => {
    const now = new Date();
    const existing = await findExistingSubscriber(db, tenantId, externalId);

    if (existing && isSubscriberCurrent(existing, input, now)) {
      span.set('subscriber.written', false);
      return { subscriber: existing, created: false, changed: false };
    }

    const attributes = resolveAttributes(existing, input);
    const [row] = await db
      .insert(tables.subscriber)
      .values({
        tenantId,
        externalId,
        attributes: attributes ?? {},
        ...(input.verifiedNow ? { identityVerifiedAt: now } : {}),
      })
      .onConflictDoUpdate({
        target: [tables.subscriber.tenantId, tables.subscriber.externalId],
        targetWhere: isNull(tables.subscriber.deletedAt),
        set: {
          ...(attributes !== undefined ? { attributes } : {}),
          ...(input.verifiedNow ? { identityVerifiedAt: now } : {}),
          updatedAt: now,
        },
      })
      .returning({ ...getTableColumns(tables.subscriber), inserted: sql<boolean>`(xmax = 0)` });

    span.set('subscriber.written', true);
    const { inserted, ...subscriber } = row!;

    return { subscriber, created: inserted, changed: true };
  });
}

export async function softDeleteSubscriber(
  db: Db,
  subscriber: Subscriber
): Promise<{ subscriber: Subscriber; subscriptions: Subscription[] }> {
  return await trace('subscribers.softDelete', async () => {
    return await db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.subscriber)
        .set({ deletedAt: new Date() })
        .where(eq(tables.subscriber.id, subscriber.id))
        .returning();

      const subscriptions = await tx
        .update(tables.subscription)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(tables.subscription.subscriberId, subscriber.id), isNull(tables.subscription.deletedAt))
        )
        .returning();
      return { subscriber: deleted!, subscriptions };
    });
  });
}
