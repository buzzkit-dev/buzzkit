import { BadRequestError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  and,
  type Column,
  count,
  type Db,
  eq,
  gte,
  isNull,
  lte,
  type SQL,
  sql,
  tables,
} from '@buzzkit/database';
import { t } from 'elysia';

export type StatsRange = { from: Date; to: Date };

export const STATS_INTERVALS = ['hour', 'day', 'week', 'month'] as const;

export type StatsInterval = (typeof STATS_INTERVALS)[number];

export type DeliveryTotals = {
  total: number;
  sent: number;
  failed: number;
  invalid: number;
  pending: number;
};

export type StatsDay = {
  date: string;
  subscribers: number;
  messages: number;
  sent: number;
  failed: number;
  invalid: number;
  pending: number;
};

export type StatsWindow = {
  subscribers: { added: number };
  messages: { total: number };
  deliveries: DeliveryTotals;
};

export type Stats = {
  range: { from: string; to: string };
  interval: StatsInterval;
  subscribers: { total: number; added: number };
  messages: { total: number };
  deliveries: DeliveryTotals;
  previous: StatsWindow;
  series: StatsDay[];
};

export const StatsQuerySchema = t.Object({
  from: t.Optional(t.String({ format: 'date-time' })),
  to: t.Optional(t.String({ format: 'date-time' })),
  interval: t.Optional(t.Union(STATS_INTERVALS.map((interval) => t.Literal(interval)))),
});

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

const SENT_STATUSES = ['sent', 'delivered'];
const FAILED_STATUSES = ['failed', 'bounced'];
const PENDING_STATUSES = ['pending', 'retrying'];

export function resolveStatsRange(query: { from?: string; to?: string }, now = new Date()): StatsRange {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * DAY_MS);
  if (from > to) {
    throw new BadRequestError('`from` must be before `to`', { param: 'from' });
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestError(`Ranges longer than ${MAX_RANGE_DAYS} days are not supported`, {
      param: 'from',
    });
  }
  return { from, to };
}

export function resolveStatsInterval(range: StatsRange, requested?: StatsInterval): StatsInterval {
  if (requested) return requested;
  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (days <= 2) return 'hour';
  if (days <= 120) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

function truncate(date: Date, interval: StatsInterval): Date {
  const at = new Date(date);
  at.setUTCMinutes(0, 0, 0);
  if (interval === 'hour') return at;
  at.setUTCHours(0);
  if (interval === 'week') at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  if (interval === 'month') at.setUTCDate(1);
  return at;
}

function advance(date: Date, interval: StatsInterval): Date {
  const next = new Date(date);
  if (interval === 'hour') next.setUTCHours(next.getUTCHours() + 1);
  else if (interval === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function bucketKey(date: Date): string {
  return date.toISOString().replace('.000Z', 'Z');
}

function bucketOf(column: SQL | Column, interval: StatsInterval) {
  return sql<string>`to_char(date_trunc(${sql.raw(`'${interval}'`)}, ${column} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

function bucket(status: string): 'sent' | 'failed' | 'invalid' | 'pending' {
  if (SENT_STATUSES.includes(status)) return 'sent';
  if (FAILED_STATUSES.includes(status)) return 'failed';
  if (PENDING_STATUSES.includes(status)) return 'pending';
  return 'invalid';
}

async function collectWindow(db: Db, tenantId: number, range: StatsRange): Promise<StatsWindow> {
  const [[subscribers], [messages], byStatus] = await Promise.all([
    trace(
      'stats.subscribersAdded',
      async () =>
        await db
          .select({ added: count() })
          .from(tables.subscriber)
          .where(
            and(
              eq(tables.subscriber.tenantId, tenantId),
              isNull(tables.subscriber.deletedAt),
              gte(tables.subscriber.createdAt, range.from),
              lte(tables.subscriber.createdAt, range.to)
            )
          )
    ),
    trace(
      'stats.messages',
      async () =>
        await db
          .select({ total: count() })
          .from(tables.message)
          .where(
            and(
              eq(tables.message.tenantId, tenantId),
              isNull(tables.message.deletedAt),
              gte(tables.message.createdAt, range.from),
              lte(tables.message.createdAt, range.to)
            )
          )
    ),
    trace(
      'stats.deliveries',
      async () =>
        await db
          .select({ status: tables.delivery.status, total: count() })
          .from(tables.delivery)
          .where(
            and(
              eq(tables.delivery.tenantId, tenantId),
              gte(tables.delivery.createdAt, range.from),
              lte(tables.delivery.createdAt, range.to)
            )
          )
          .groupBy(tables.delivery.status)
    ),
  ]);

  const deliveries: DeliveryTotals = { total: 0, sent: 0, failed: 0, invalid: 0, pending: 0 };
  for (const row of byStatus) {
    deliveries.total += Number(row.total);
    deliveries[bucket(row.status)] += Number(row.total);
  }
  return {
    subscribers: { added: Number(subscribers?.added ?? 0) },
    messages: { total: Number(messages?.total ?? 0) },
    deliveries,
  };
}

export async function collectStats(
  db: Db,
  tenantId: number,
  range: StatsRange,
  interval: StatsInterval
): Promise<Stats> {
  const deliveriesInRange = and(
    eq(tables.delivery.tenantId, tenantId),
    gte(tables.delivery.createdAt, range.from),
    lte(tables.delivery.createdAt, range.to)
  );
  const day = bucketOf(tables.delivery.createdAt, interval);
  const subscriberDay = bucketOf(tables.subscriber.createdAt, interval);
  const messageDay = bucketOf(tables.message.createdAt, interval);
  const span = range.to.getTime() - range.from.getTime();
  const before = { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };

  const [current, previous, [subscribers], byDay, subscribersByDay, messagesByDay] = await Promise.all([
    collectWindow(db, tenantId, range),
    collectWindow(db, tenantId, before),
    trace(
      'stats.subscribers',
      async () =>
        await db
          .select({ total: count() })
          .from(tables.subscriber)
          .where(and(eq(tables.subscriber.tenantId, tenantId), isNull(tables.subscriber.deletedAt)))
    ),
    trace(
      'stats.series',
      async () =>
        await db
          .select({ day, status: tables.delivery.status, total: count() })
          .from(tables.delivery)
          .where(deliveriesInRange)
          .groupBy(day, tables.delivery.status)
    ),
    trace(
      'stats.subscribersSeries',
      async () =>
        await db
          .select({ day: subscriberDay, total: count() })
          .from(tables.subscriber)
          .where(
            and(
              eq(tables.subscriber.tenantId, tenantId),
              isNull(tables.subscriber.deletedAt),
              gte(tables.subscriber.createdAt, range.from),
              lte(tables.subscriber.createdAt, range.to)
            )
          )
          .groupBy(subscriberDay)
    ),
    trace(
      'stats.messagesSeries',
      async () =>
        await db
          .select({ day: messageDay, total: count() })
          .from(tables.message)
          .where(
            and(
              eq(tables.message.tenantId, tenantId),
              isNull(tables.message.deletedAt),
              gte(tables.message.createdAt, range.from),
              lte(tables.message.createdAt, range.to)
            )
          )
          .groupBy(messageDay)
    ),
  ]);

  const days = new Map<string, StatsDay>();
  const empty = (date: string): StatsDay => ({
    date,
    subscribers: 0,
    messages: 0,
    sent: 0,
    failed: 0,
    invalid: 0,
    pending: 0,
  });
  for (let at = truncate(range.from, interval); at <= range.to; at = advance(at, interval)) {
    days.set(bucketKey(at), empty(bucketKey(at)));
  }
  for (const row of byDay) {
    const entry = days.get(row.day);
    if (entry) entry[bucket(row.status)] += Number(row.total);
  }
  for (const row of subscribersByDay) {
    const entry = days.get(row.day);
    if (entry) entry.subscribers += Number(row.total);
  }
  for (const row of messagesByDay) {
    const entry = days.get(row.day);
    if (entry) entry.messages += Number(row.total);
  }

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    interval,
    subscribers: { total: Number(subscribers?.total ?? 0), added: current.subscribers.added },
    messages: current.messages,
    deliveries: current.deliveries,
    previous,
    series: [...days.values()],
  };
}
