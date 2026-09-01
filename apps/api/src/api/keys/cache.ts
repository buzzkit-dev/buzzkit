import { env } from 'cloudflare:workers';
import { deleteCache } from '@buzzkit/api/libs/cache';
import { type Db, eq, tables } from '@buzzkit/database';

export function keyCacheKey(keyHash: string): string {
  return `apikey:${keyHash}`;
}

export async function purgeApiKeyCache(keyHashes: string[]): Promise<void> {
  await deleteCache(env.AUTH_CACHE, keyHashes.map(keyCacheKey));
}

export async function purgeApiKeyCacheForTenant(db: Db, tenantId: number): Promise<void> {
  const rows = await db
    .select({ keyHash: tables.apiKey.keyHash })
    .from(tables.apiKey)
    .where(eq(tables.apiKey.tenantId, tenantId));
  await purgeApiKeyCache(rows.map((row) => row.keyHash));
}

export async function purgeApiKeyCacheForWorkspace(db: Db, workspaceId: number): Promise<void> {
  const rows = await db
    .select({ keyHash: tables.apiKey.keyHash })
    .from(tables.apiKey)
    .where(eq(tables.apiKey.workspaceId, workspaceId));
  await purgeApiKeyCache(rows.map((row) => row.keyHash));
}
