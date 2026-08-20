import { env } from 'cloudflare:workers';
import { createDrizzle, type Db } from '@buzzkit/database';
import { instrumentDrizzleClient } from '@kubiks/otel-drizzle';
import Elysia from 'elysia';

export const createDb = (): Db => instrumentDrizzleClient(createDrizzle(env.HYPERDRIVE.connectionString));

export const database = new Elysia({ name: 'db/service' }).derive({ as: 'global' }, () => ({
  db: createDb(),
}));
