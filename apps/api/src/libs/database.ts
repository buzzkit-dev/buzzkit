import { env } from 'cloudflare:workers';
import { count, createDrizzle, type Db, type DrizzleOptions, type SQL } from '@buzzkit/database';
import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import type { PgTable } from 'drizzle-orm/pg-core';
import Elysia from 'elysia';

const BATCH_DB_CONNECTIONS = 2;

export const createDb = (options: DrizzleOptions = {}, { traced = true }: { traced?: boolean } = {}): Db => {
  const db = createDrizzle(env.HYPERDRIVE.connectionString, options);
  return traced ? instrumentDrizzleClient(db) : db;
};

export const stepDb = (): Db => createDb({ max: 1 }, { traced: false });

export const batchDb = (): Db => createDb({ max: BATCH_DB_CONNECTIONS });

export async function countRows(db: Db, table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(table).where(where);
  return Number(row?.total ?? 0);
}

export const database = new Elysia({ name: 'db/service' }).derive({ as: 'global' }, () => {
  return {
    db: createDb(),
  };
});
