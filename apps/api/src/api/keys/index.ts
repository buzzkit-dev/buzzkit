import { env } from 'cloudflare:workers';
import { readCache, writeCache } from '@buzzkit/api/libs/cache';
import { countRows } from '@buzzkit/api/libs/database';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, type Page, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, isNull, lt, type Tx, tables } from '@buzzkit/database';
import { keyCacheKey, purgeApiKeyCache } from './cache';
import { CLIENT_KEY_PREFIX, KEY_CACHE_TTL_SECONDS, KIND_PREFIXES } from './constants';
import { maskApiKey } from './serialize';
import { generateApiKeySecret, hashApiKeySecret } from './tokens';
import type { ApiKey, ApiKeyKind, ResolvedApiKey } from './types';

export * from './cache';
export * from './constants';
export * from './serialize';
export * from './tokens';
export type * from './types';

export async function listApiKeys(
  db: Db,
  workspaceId: number,
  options: { cursor?: string; limit?: number; kind?: ApiKeyKind } = {}
): Promise<Page<ReturnType<typeof maskApiKey>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('key', id));

  const [rows, total] = await Promise.all([
    trace('keys.list', async () => {
      return await db
        .select()
        .from(tables.apiKey)
        .where(
          and(
            eq(tables.apiKey.workspaceId, workspaceId),
            isNull(tables.apiKey.deletedAt),
            options.kind ? eq(tables.apiKey.kind, options.kind) : undefined,
            beforeId !== undefined ? lt(tables.apiKey.id, beforeId) : undefined
          )
        )
        .orderBy(desc(tables.apiKey.id))
        .limit(limit + 1);
    }),
    countApiKeys(db, workspaceId, options.kind),
  ]);

  return { ...toPage(rows.map(maskApiKey), limit, (id) => encodeId('key', id)), total };
}

export async function countApiKeys(db: Db, workspaceId: number, kind?: ApiKeyKind): Promise<number> {
  return await trace('keys.count', async () => {
    return await countRows(
      db,
      tables.apiKey,
      and(
        eq(tables.apiKey.workspaceId, workspaceId),
        isNull(tables.apiKey.deletedAt),
        kind ? eq(tables.apiKey.kind, kind) : undefined
      )
    );
  });
}

export async function findApiKey(db: Db, workspaceId: number, keySqid: string): Promise<ApiKey> {
  const keyId = decodeEntityId('key', keySqid);
  if (!keyId) {
    throw new NotFoundError('Key not found');
  }

  const [key] = await trace('keys.find', async () => {
    return await db
      .select()
      .from(tables.apiKey)
      .where(
        and(
          eq(tables.apiKey.id, keyId),
          eq(tables.apiKey.workspaceId, workspaceId),
          isNull(tables.apiKey.deletedAt)
        )
      );
  });

  if (!key) {
    throw new NotFoundError('API key not found');
  }
  return key;
}

export async function selectActiveApiKeyByHash(db: Db, keyHash: string): Promise<ResolvedApiKey | null> {
  const cached = await readCache<ResolvedApiKey>(env.AUTH_CACHE, keyCacheKey(keyHash));
  if (cached) return cached;

  const [result] = await trace('keys.findActiveByHash', async () => {
    return await db
      .select({ key: tables.apiKey, workspace: tables.workspace, tenant: tables.tenant })
      .from(tables.apiKey)
      .innerJoin(
        tables.workspace,
        and(eq(tables.workspace.id, tables.apiKey.workspaceId), isNull(tables.workspace.deletedAt))
      )
      .leftJoin(
        tables.tenant,
        and(eq(tables.tenant.id, tables.apiKey.tenantId), isNull(tables.tenant.deletedAt))
      )
      .where(
        and(
          eq(tables.apiKey.keyHash, keyHash),
          isNull(tables.apiKey.deletedAt),
          isNull(tables.apiKey.revokedAt)
        )
      );
  });

  if (!result) return null;
  if (result.key.kind !== 'workspace' && !result.tenant) return null;

  const secondsUntilExpiry = result.key.expiresAt
    ? Math.floor((result.key.expiresAt.getTime() - Date.now()) / 1000)
    : KEY_CACHE_TTL_SECONDS;
  if (secondsUntilExpiry >= 60) {
    await writeCache(
      env.AUTH_CACHE,
      keyCacheKey(keyHash),
      result,
      Math.min(KEY_CACHE_TTL_SECONDS, secondsUntilExpiry)
    );
  }

  return result;
}

export async function createApiKey(
  db: Db,
  workspaceId: number,
  input: { name: string; kind: ApiKeyKind; scopes: string[]; expiresAt?: Date; tenantId?: number },
  createdByUserId: string
): Promise<{ key: ApiKey; secret: string }> {
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw new BadRequestError('expiresAt must be in the future');
  }
  if (input.kind !== 'workspace' && !input.tenantId) {
    throw new BadRequestError(`${input.kind === 'client' ? 'Client' : 'Tenant'} keys require a tenant`);
  }

  const secret = generateApiKeySecret(input.kind);
  const keyHash = await hashApiKeySecret(secret);
  const prefixLength = KIND_PREFIXES[input.kind].length;

  const [key] = await trace('keys.create', async () => {
    return await db
      .insert(tables.apiKey)
      .values({
        workspaceId,
        tenantId: input.kind === 'workspace' ? null : input.tenantId,
        name: input.name,
        kind: input.kind,
        keyHash,
        token: input.kind === 'client' ? secret : null,
        prefix: secret.slice(0, prefixLength + 6),
        last4: secret.slice(-4),
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        createdByUserId,
      })
      .returning();
  });

  return { key: key!, secret };
}

export async function createDefaultClientKey(
  db: Db | Tx,
  workspaceId: number,
  tenantId: number,
  createdByUserId: string | null
): Promise<ApiKey> {
  const secret = generateApiKeySecret('client');

  const [key] = await trace('keys.createDefaultClient', async () => {
    return await db
      .insert(tables.apiKey)
      .values({
        workspaceId,
        tenantId,
        name: 'Default',
        kind: 'client',
        keyHash: await hashApiKeySecret(secret),
        token: secret,
        prefix: secret.slice(0, CLIENT_KEY_PREFIX.length + 6),
        last4: secret.slice(-4),
        scopes: [],
        createdByUserId,
      })
      .returning();
  });
  return key!;
}

export async function revokeApiKey(db: Db, keyId: number): Promise<ApiKey> {
  const [revoked] = await trace('keys.revoke', async () => {
    return await db
      .update(tables.apiKey)
      .set({ revokedAt: new Date() })
      .where(eq(tables.apiKey.id, keyId))
      .returning();
  });

  await purgeApiKeyCache([revoked!.keyHash]);
  return revoked!;
}

export async function touchApiKey(db: Db, key: ApiKey): Promise<void> {
  const now = new Date();
  if (key.lastUsedAt && now.getTime() - key.lastUsedAt.getTime() < 60_000) return;

  await trace('keys.touch', async () => {
    return await db.update(tables.apiKey).set({ lastUsedAt: now }).where(eq(tables.apiKey.id, key.id));
  });
  key.lastUsedAt = now;
}
