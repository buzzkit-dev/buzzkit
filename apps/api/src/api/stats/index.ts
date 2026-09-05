import { countLiveRuns } from '@buzzkit/api/api/runs/index';
import { listWorkflows } from '@buzzkit/api/api/workflows/index';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { formatClickHouseDateTime, parseClickHouseTime, tinybird } from '@buzzkit/api/libs/tinybird';
import { and, count, type Db, eq, gte, isNull, lte, min, sql, tables } from '@buzzkit/database';
import { TOP_EVENTS, TOP_WORKFLOWS } from './constants';
import { advance, bucket, bucketKey, bucketOf, truncate } from './range';
import type {
  DeliveryTotals,
  RunTotals,
  Stats,
  StatsDay,
  StatsInterval,
  StatsRange,
  StatsWindow,
  StatsWorkflow,
} from './types';

export * from './constants';
export * from './range';
export * from './schemas';
export type * from './types';

type HourlyEvents = Array<{ bucket: string; count: number }>;

type HourlyRuns = Array<{
  bucket: string;
  started: number;
  live: number;
  completed: number;
  canceled: number;
  failed: number;
}>;

async function listHourlyEvents(tenantId: number, range: StatsRange): Promise<HourlyEvents> {
  const result = await trace('stats.events', async () => {
    return (await tinybird()).eventVolume.query({
      tenant_id: tenantId,
      start: formatClickHouseDateTime(range.from.toISOString()),
      end: formatClickHouseDateTime(range.to.toISOString()),
      bucket_seconds: 3600,
      exclude_source: 'system',
    });
  });
  return result.data.map((row) => ({ bucket: parseClickHouseTime(row.bucket), count: Number(row.count) }));
}

async function listHourlyRuns(tenantId: number, range: StatsRange): Promise<HourlyRuns> {
  const result = await trace('stats.runs', async () => {
    return (await tinybird()).runVolume.query({
      tenant_id: tenantId,
      start: formatClickHouseDateTime(range.from.toISOString()),
      end: formatClickHouseDateTime(range.to.toISOString()),
    });
  });

  return result.data.map((row) => {
    return {
      bucket: parseClickHouseTime(row.bucket),
      started: Number(row.started),
      live: Number(row.live),
      completed: Number(row.completed),
      canceled: Number(row.canceled),
      failed: Number(row.failed),
    };
  });
}

function sumRuns(rows: HourlyRuns): RunTotals {
  const totals: RunTotals = { started: 0, live: 0, completed: 0, canceled: 0, failed: 0 };
  for (const row of rows) {
    totals.started += row.started;
    totals.live += row.live;
    totals.completed += row.completed;
    totals.canceled += row.canceled;
    totals.failed += row.failed;
  }
  return totals;
}

async function collectWindow(
  db: Db,
  tenantId: number,
  range: StatsRange
): Promise<StatsWindow & { hourlyEvents: HourlyEvents; hourlyRuns: HourlyRuns }> {
  const [[subscribers], [messages], byStatus, hourlyEvents, hourlyRuns] = await Promise.all([
    trace('stats.subscribersAdded', async () => {
      return await db
        .select({ added: count() })
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            isNull(tables.subscriber.deletedAt),
            gte(tables.subscriber.createdAt, range.from),
            lte(tables.subscriber.createdAt, range.to)
          )
        );
    }),
    trace('stats.messages', async () => {
      return await db
        .select({ total: count() })
        .from(tables.message)
        .where(
          and(
            eq(tables.message.tenantId, tenantId),
            isNull(tables.message.deletedAt),
            gte(tables.message.createdAt, range.from),
            lte(tables.message.createdAt, range.to)
          )
        );
    }),
    trace('stats.deliveries', async () => {
      const capped = sql<boolean>`${tables.delivery.lastErrorCode} = 'capped'`;
      return await db
        .select({ status: tables.delivery.status, capped, total: count() })
        .from(tables.delivery)
        .where(
          and(
            eq(tables.delivery.tenantId, tenantId),
            gte(tables.delivery.createdAt, range.from),
            lte(tables.delivery.createdAt, range.to)
          )
        )
        .groupBy(tables.delivery.status, capped);
    }),
    listHourlyEvents(tenantId, range),
    listHourlyRuns(tenantId, range),
  ]);

  const deliveries: DeliveryTotals = {
    total: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    capped: 0,
    invalid: 0,
    pending: 0,
  };

  for (const row of byStatus) {
    deliveries.total += Number(row.total);
    deliveries[bucket(row.status, row.capped === true)] += Number(row.total);
    if (row.status === 'delivered') deliveries.delivered += Number(row.total);
  }

  return {
    subscribers: { added: Number(subscribers?.added ?? 0) },
    messages: { total: Number(messages?.total ?? 0) },
    deliveries,
    events: { total: hourlyEvents.reduce((total, row) => total + row.count, 0) },
    runs: sumRuns(hourlyRuns),
    hourlyEvents,
    hourlyRuns,
  };
}

async function listTopEvents(tenantId: number, range: StatsRange) {
  const result = await trace('stats.topEvents', async () => {
    return (await tinybird()).eventTop.query({
      tenant_id: tenantId,
      start: formatClickHouseDateTime(range.from.toISOString()),
      end: formatClickHouseDateTime(range.to.toISOString()),
      limit: TOP_EVENTS,
      exclude_source: 'system',
    });
  });
  return result.data.map((row) => ({ name: row.name, count: Number(row.count) }));
}

async function listLatestRuns(tenantId: number): Promise<Map<string, string>> {
  const result = await trace('stats.latestRuns', async () => {
    return (await tinybird()).runLatest.query({ tenant_id: tenantId });
  });
  return new Map(result.data.map((row) => [row.workflow_id, parseClickHouseTime(row.last_started_at)]));
}

async function listActiveWorkflows(db: Db, tenantId: number): Promise<StatsWorkflow[]> {
  const [workflows, counts, latest] = await Promise.all([
    listWorkflows(db, tenantId),
    countLiveRuns(tenantId),
    listLatestRuns(tenantId),
  ]);

  return workflows
    .filter((workflow) => workflow.status === 'active')
    .map((workflow) => {
      const id = encodeId('workflow', workflow.id);
      const live = counts.get(id);

      return {
        slug: workflow.slug,
        name: workflow.name,
        running: live?.running ?? 0,
        sleeping: live?.sleeping ?? 0,
        waiting: live?.waiting ?? 0,
        lastRunAt: latest.get(id) ?? null,
      };
    })
    .sort((a, b) => b.running + b.sleeping + b.waiting - (a.running + a.sleeping + a.waiting))
    .slice(0, TOP_WORKFLOWS);
}

async function countScheduled(db: Db, tenantId: number) {
  const [row] = await trace('stats.scheduled', async () => {
    return await db
      .select({ total: count(), nextAt: min(tables.message.scheduledFor) })
      .from(tables.message)
      .where(
        and(
          eq(tables.message.tenantId, tenantId),
          eq(tables.message.status, 'scheduled'),
          isNull(tables.message.deletedAt)
        )
      );
  });
  return { count: Number(row?.total ?? 0), nextAt: row?.nextAt ? new Date(row.nextAt).toISOString() : null };
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

  const [
    current,
    previous,
    [subscribers],
    byDay,
    subscribersByDay,
    messagesByDay,
    topEvents,
    workflows,
    scheduled,
  ] = await Promise.all([
    collectWindow(db, tenantId, range),
    collectWindow(db, tenantId, before),
    trace('stats.subscribers', async () => {
      return await db
        .select({ total: count() })
        .from(tables.subscriber)
        .where(and(eq(tables.subscriber.tenantId, tenantId), isNull(tables.subscriber.deletedAt)));
    }),
    trace('stats.series', async () => {
      const capped = sql<boolean>`${tables.delivery.lastErrorCode} = 'capped'`;
      return await db
        .select({ day, status: tables.delivery.status, capped, total: count() })
        .from(tables.delivery)
        .where(deliveriesInRange)
        .groupBy(day, tables.delivery.status, capped);
    }),
    trace('stats.subscribersSeries', async () => {
      return await db
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
        .groupBy(subscriberDay);
    }),
    trace('stats.messagesSeries', async () => {
      return await db
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
        .groupBy(messageDay);
    }),
    listTopEvents(tenantId, range),
    listActiveWorkflows(db, tenantId),
    countScheduled(db, tenantId),
  ]);

  const days = new Map<string, StatsDay>();
  const empty = (date: string): StatsDay => {
    return {
      date,
      subscribers: 0,
      messages: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      capped: 0,
      invalid: 0,
      pending: 0,
      events: 0,
      runsStarted: 0,
      runsCompleted: 0,
      runsFailed: 0,
    };
  };
  for (let at = truncate(range.from, interval); at <= range.to; at = advance(at, interval)) {
    days.set(bucketKey(at), empty(bucketKey(at)));
  }
  for (const row of byDay) {
    const entry = days.get(row.day);
    if (!entry) continue;
    entry[bucket(row.status, row.capped === true)] += Number(row.total);
    if (row.status === 'delivered') entry.delivered += Number(row.total);
  }
  for (const row of subscribersByDay) {
    const entry = days.get(row.day);
    if (entry) entry.subscribers += Number(row.total);
  }
  for (const row of messagesByDay) {
    const entry = days.get(row.day);
    if (entry) entry.messages += Number(row.total);
  }
  for (const row of current.hourlyEvents) {
    const entry = days.get(bucketKey(truncate(new Date(row.bucket), interval)));
    if (entry) entry.events += row.count;
  }
  for (const row of current.hourlyRuns) {
    const entry = days.get(bucketKey(truncate(new Date(row.bucket), interval)));
    if (!entry) continue;
    entry.runsStarted += row.started;
    entry.runsCompleted += row.completed;
    entry.runsFailed += row.failed;
  }

  const { hourlyEvents: _events, hourlyRuns: _runs, ...previousWindow } = previous;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    interval,
    subscribers: { total: Number(subscribers?.total ?? 0), added: current.subscribers.added },
    messages: current.messages,
    deliveries: current.deliveries,
    events: current.events,
    runs: current.runs,
    topEvents,
    workflows,
    scheduled,
    previous: previousWindow,
    series: [...days.values()],
  };
}
