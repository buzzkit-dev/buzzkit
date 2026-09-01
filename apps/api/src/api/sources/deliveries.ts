import { countRows } from '@buzzkit/api/libs/database';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { DAY_MS } from '@buzzkit/api/libs/timezone';
import { clampLimit, type Page, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, lt, tables } from '@buzzkit/database';
import { DELIVERY_OUTCOMES, type DeliveryOutcome } from '@buzzkit/schema/sources';
import { DELIVERY_RETENTION_DAYS } from './constants';
import { serializeSourceDelivery } from './serialize';

export async function countSourceDeliveries(
  db: Db,
  sourceId: number,
  outcome?: DeliveryOutcome
): Promise<number> {
  return await countRows(
    db,
    tables.sourceDelivery,
    and(
      eq(tables.sourceDelivery.sourceId, sourceId),
      outcome ? eq(tables.sourceDelivery.outcome, outcome) : undefined
    )
  );
}

export async function listSourceDeliveries(
  db: Db,
  sourceId: number,
  options: { cursor?: string; limit?: number; outcome?: string } = {}
): Promise<Page<ReturnType<typeof serializeSourceDelivery>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('sourceDelivery', id));
  const outcome = (DELIVERY_OUTCOMES as readonly string[]).includes(options.outcome ?? '')
    ? (options.outcome as DeliveryOutcome)
    : undefined;

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(tables.sourceDelivery)
      .where(
        and(
          eq(tables.sourceDelivery.sourceId, sourceId),
          outcome ? eq(tables.sourceDelivery.outcome, outcome) : undefined,
          beforeId !== undefined ? lt(tables.sourceDelivery.id, beforeId) : undefined
        )
      )
      .orderBy(desc(tables.sourceDelivery.id))
      .limit(limit + 1),
    countSourceDeliveries(db, sourceId, outcome),
  ]);

  const items = rows.map(serializeSourceDelivery);

  return { ...toPage(items, limit, (id) => encodeId('sourceDelivery', id)), total };
}

export async function purgeSourceDeliveries(db: Db, limit: number): Promise<number> {
  const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * DAY_MS);
  const stale = await db
    .select({ id: tables.sourceDelivery.id })
    .from(tables.sourceDelivery)
    .where(lt(tables.sourceDelivery.receivedAt, cutoff))
    .limit(limit);
  for (const row of stale) await db.delete(tables.sourceDelivery).where(eq(tables.sourceDelivery.id, row.id));

  return stale.length;
}
