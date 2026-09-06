import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, inArray, isNull, or, type SQL, sql, type Tx, tables } from '@buzzkit/database';
import type { Subscriber, SubscriberAlias, SubscriberAliasSource } from './types';

export function serializeSubscriberAlias(alias: SubscriberAlias) {
  return {
    externalId: alias.externalId,
    source: alias.source,
    createdAt: alias.createdAt,
  };
}

export function externalIdCondition(externalIds: string[]): SQL {
  return or(
    inArray(tables.subscriber.externalId, externalIds),
    sql`exists (
      select 1 from ${tables.subscriberAlias}
      where ${tables.subscriberAlias.subscriberId} = ${tables.subscriber.id}
        and ${tables.subscriberAlias.tenantId} = ${tables.subscriber.tenantId}
        and ${inArray(tables.subscriberAlias.externalId, externalIds)}
        and ${tables.subscriberAlias.deletedAt} is null
    )`
  )!;
}

export async function listSubscriberAliases(
  db: Db,
  tenantId: number,
  subscriberId: number
): Promise<SubscriberAlias[]> {
  return await db
    .select()
    .from(tables.subscriberAlias)
    .where(
      and(
        eq(tables.subscriberAlias.tenantId, tenantId),
        eq(tables.subscriberAlias.subscriberId, subscriberId),
        isNull(tables.subscriberAlias.deletedAt)
      )
    )
    .orderBy(tables.subscriberAlias.id);
}

export async function selectSubscriberByAlias(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber | null> {
  const [row] = await db
    .select({ subscriber: tables.subscriber })
    .from(tables.subscriberAlias)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscriberAlias.subscriberId))
    .where(
      and(
        eq(tables.subscriberAlias.tenantId, tenantId),
        eq(tables.subscriberAlias.externalId, externalId),
        isNull(tables.subscriberAlias.deletedAt),
        isNull(tables.subscriber.deletedAt)
      )
    );
  return row?.subscriber ?? null;
}

export async function recordSubscriberAlias(
  db: Db | Tx,
  tenantId: number,
  input: { subscriberId: number; externalId: string; source: SubscriberAliasSource }
): Promise<SubscriberAlias | null> {
  const [alias] = await db
    .insert(tables.subscriberAlias)
    .values({
      tenantId,
      subscriberId: input.subscriberId,
      externalId: input.externalId,
      source: input.source,
    })
    .onConflictDoNothing({
      target: [tables.subscriberAlias.tenantId, tables.subscriberAlias.externalId],
      where: isNull(tables.subscriberAlias.deletedAt),
    })
    .returning();

  return alias ?? null;
}

export async function repointSubscriberAliases(
  db: Db | Tx,
  source: Subscriber,
  target: Subscriber
): Promise<number> {
  return await trace('subscribers.repointAliases', async () => {
    const moved = await db
      .update(tables.subscriberAlias)
      .set({ subscriberId: target.id })
      .where(
        and(eq(tables.subscriberAlias.subscriberId, source.id), isNull(tables.subscriberAlias.deletedAt))
      )
      .returning({ id: tables.subscriberAlias.id });

    return moved.length;
  });
}
