import { env } from 'cloudflare:workers';
import { createBetterAuth } from '@buzzkit/auth';
import { type Db, tables } from '@buzzkit/database';
import { instrumentBetterAuth } from '@kubiks/otel-better-auth';
import { sha256Hex } from '../crypto';
import { createDb } from '../database';

export const SESSION_CACHE_TTL = 300;

export const sessionCacheKey = async (token: string) => `session:${await sha256Hex(token)}`;

export const authClient = (db?: Db) => {
  const auth = createBetterAuth({ db: db ?? createDb(), env, schema: tables.auth });
  return instrumentBetterAuth(auth as unknown as Parameters<typeof instrumentBetterAuth>[0]) as typeof auth;
};
