import { env } from 'cloudflare:workers';
import { createDrizzle } from '@buzzkit/database';
import Elysia from 'elysia';

export const database = new Elysia({ name: 'db/service' }).derive({ as: 'global' }, () => ({
  db: createDrizzle(env.HYPERDRIVE.connectionString),
}));
