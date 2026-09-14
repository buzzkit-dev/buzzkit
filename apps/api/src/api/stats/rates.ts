import { trace } from '@buzzkit/api/libs/telemetry';
import { formatClickHouseDateTime, parseClickHouseTime, tinybird } from '@buzzkit/api/libs/tinybird';
import { and, count, type Db, gte, isNull, lt, sql, tables } from '@buzzkit/database';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { RATE_SAMPLE_MINUTES, RATE_WINDOW_MINUTES } from './constants';
import type { StatsRange, StatsRate, StatsRates } from './types';

const MINUTE_MS = 60_000;

type MinuteCount = { minute: string; count: number };

function minuteExpression(column: AnyPgColumn) {
  return sql<string>`floor(extract(epoch from date_trunc('minute', ${column})))`;
}

function minuteOf(epochSeconds: string): string {
  return new Date(Number(epochSeconds) * 1000).toISOString();
}

function resolveRateWindow(now: Date): StatsRange {
  const to = new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
  return { from: new Date(to.getTime() - RATE_WINDOW_MINUTES * MINUTE_MS), to };
}

function resolveRate(window: StatsRange, counts: MinuteCount[]): StatsRate {
  const byMinute = new Map(counts.map((entry) => [entry.minute, entry.count]));
  const series: StatsRate['series'] = [];
  for (let at = window.from.getTime(); at < window.to.getTime(); at += MINUTE_MS) {
    const minute = new Date(at).toISOString();
    series.push({ minute, count: byMinute.get(minute) ?? 0 });
  }

  const sampled = series.slice(-RATE_SAMPLE_MINUTES);
  const total = sampled.reduce((sum, entry) => sum + entry.count, 0);
  return { perMinute: Math.round((total / RATE_SAMPLE_MINUTES) * 10) / 10, series };
}

async function listDeliveryMinutes(db: Db, window: StatsRange): Promise<MinuteCount[]> {
  const minute = minuteExpression(tables.delivery.createdAt);
  const rows = await trace('stats.deliveryRate', async () => {
    return await db
      .select({ minute, count: count() })
      .from(tables.delivery)
      .where(and(gte(tables.delivery.createdAt, window.from), lt(tables.delivery.createdAt, window.to)))
      .groupBy(minute);
  });
  return rows.map((row) => ({ minute: minuteOf(row.minute), count: row.count }));
}

async function listMessageMinutes(db: Db, window: StatsRange): Promise<MinuteCount[]> {
  const minute = minuteExpression(tables.message.createdAt);
  const rows = await trace('stats.messageRate', async () => {
    return await db
      .select({ minute, count: count() })
      .from(tables.message)
      .where(
        and(
          isNull(tables.message.deletedAt),
          gte(tables.message.createdAt, window.from),
          lt(tables.message.createdAt, window.to)
        )
      )
      .groupBy(minute);
  });
  return rows.map((row) => ({ minute: minuteOf(row.minute), count: row.count }));
}

async function listEventMinutes(window: StatsRange): Promise<MinuteCount[]> {
  const result = await trace('stats.eventRate', async () => {
    const client = await tinybird();
    return client.eventRate.query({
      start: formatClickHouseDateTime(window.from.toISOString()),
      end: formatClickHouseDateTime(window.to.toISOString()),
      exclude_source: 'system',
    });
  });
  return result.data.map((row) => ({ minute: parseClickHouseTime(row.bucket), count: Number(row.count) }));
}

async function listRunMinutes(window: StatsRange): Promise<MinuteCount[]> {
  const result = await trace('stats.runRate', async () => {
    const client = await tinybird();
    return client.runRate.query({
      start: formatClickHouseDateTime(window.from.toISOString()),
      end: formatClickHouseDateTime(window.to.toISOString()),
    });
  });
  return result.data.map((row) => ({ minute: parseClickHouseTime(row.bucket), count: Number(row.count) }));
}

export async function collectRates(db: Db, now = new Date()): Promise<StatsRates> {
  const window = resolveRateWindow(now);
  const [deliveries, messages, events, runs] = await Promise.all([
    listDeliveryMinutes(db, window),
    listMessageMinutes(db, window),
    listEventMinutes(window),
    listRunMinutes(window),
  ]);

  return {
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      sampleMinutes: RATE_SAMPLE_MINUTES,
    },
    deliveries: resolveRate(window, deliveries),
    messages: resolveRate(window, messages),
    events: resolveRate(window, events),
    runs: resolveRate(window, runs),
  };
}
