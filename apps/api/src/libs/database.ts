import { env } from 'cloudflare:workers';
import { createDrizzle, type Db, type DrizzleOptions } from '@buzzkit/database';
import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import Elysia from 'elysia';

export const createDb = (options: DrizzleOptions = {}): Db =>
  instrumentDrizzleClient(createDrizzle(env.HYPERDRIVE.connectionString, options));

export const database = new Elysia({ name: 'db/service' }).derive({ as: 'global' }, () => ({
  db: createDb(),
}));
