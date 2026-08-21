import { env } from 'cloudflare:workers';
import { deleteCache, readCache, writeCache } from '@buzzkit/api/libs/cache';
import { sha256Hex } from '@buzzkit/api/libs/crypto';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';

export type ApiKey = typeof tables.apiKey.$inferSelect;
export type ApiKeyKind = ApiKey['kind'];

export const WORKSPACE_KEY_PREFIX = 'bk_ws_';
export const TENANT_KEY_PREFIX = 'bk_tn_';
export const CLIENT_KEY_PREFIX = 'bk_pk_';

const SECRET_KEY_PREFIXES = [WORKSPACE_KEY_PREFIX, TENANT_KEY_PREFIX] as const;
const ALL_KEY_PREFIXES = [WORKSPACE_KEY_PREFIX, TENANT_KEY_PREFIX, CLIENT_KEY_PREFIX] as const;

const SECRET_LENGTH = 40;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function isApiKeyToken(token: string): boolean {
  return SECRET_KEY_PREFIXES.some((prefix) => token.startsWith(prefix));
}

export function isClientKeyToken(token: string): boolean {
  return token.startsWith(CLIENT_KEY_PREFIX);
}

export function randomString(length: number): string {
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < 248) {
        chars.push(ALPHABET[byte % 62] as string);
        if (chars.length === length) break;
      }
    }
  }

  return chars.join('');
}

export function keyKindOf(token: string): ApiKeyKind | null {
  return (
    (Object.keys(KIND_PREFIXES) as ApiKeyKind[]).find((kind) => token.startsWith(KIND_PREFIXES[kind])) ?? null
  );
}

const KIND_PREFIXES: Record<ApiKeyKind, string> = {
  workspace: WORKSPACE_KEY_PREFIX,
  tenant: TENANT_KEY_PREFIX,
  client: CLIENT_KEY_PREFIX,
};

export function generateApiKeySecret(kind: ApiKeyKind): string {
  return `${KIND_PREFIXES[kind]}${randomString(SECRET_LENGTH)}`;
}

export function stripApiKeyPrefix(token: string): string {
  const prefix = ALL_KEY_PREFIXES.find((p) => token.startsWith(p));
  return prefix ? token.slice(prefix.length) : token;
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}

export function maskApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    kind: key.kind,
    tenantId: key.tenantId,
    token: key.kind === 'client' ? key.token : null,
    prefix: key.prefix,
    last4: key.last4,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
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

  const [key] = await trace(
    'keys.create',
    async () =>
      await db
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
        .returning()
  );

  return { key: key!, secret };
}

export async function listApiKeys(db: Db, workspaceId: number) {
  const keys = await trace(
    'keys.list',
    async () =>
      await db
        .select()
        .from(tables.apiKey)
        .where(and(eq(tables.apiKey.workspaceId, workspaceId), isNull(tables.apiKey.deletedAt)))
        .orderBy(desc(tables.apiKey.createdAt))
  );

  return keys.map(maskApiKey);
}

export async function findApiKey(db: Db, workspaceId: number, keySqid: string): Promise<ApiKey> {
  const keyId = decodeEntityId('key', keySqid);

  if (!keyId) {
    throw new NotFoundError('Key not found');
  }

  const [key] = await trace(
    'keys.find',
    async () =>
      await db
        .select()
        .from(tables.apiKey)
        .where(
          and(
            eq(tables.apiKey.id, keyId),
            eq(tables.apiKey.workspaceId, workspaceId),
            isNull(tables.apiKey.deletedAt)
          )
        )
  );

  if (!key) {
    throw new NotFoundError('API key not found');
  }

  return key;
}

export async function revokeApiKey(db: Db, keyId: number): Promise<ApiKey> {
  const [revoked] = await trace(
    'keys.revoke',
    async () =>
      await db
        .update(tables.apiKey)
        .set({ revokedAt: new Date() })
        .where(eq(tables.apiKey.id, keyId))
        .returning()
  );

  await purgeApiKeyCache([revoked!.keyHash]);

  return revoked!;
}

export type ResolvedApiKey = {
  key: ApiKey;
  workspace: typeof tables.workspace.$inferSelect;
  tenant: typeof tables.tenant.$inferSelect | null;
};

const KEY_CACHE_TTL_SECONDS = 60;

const keyCacheKey = (keyHash: string) => `apikey:${keyHash}`;

export async function findActiveApiKeyByHash(db: Db, keyHash: string): Promise<ResolvedApiKey | null> {
  const cached = await readCache<ResolvedApiKey>(env.AUTH_CACHE, keyCacheKey(keyHash));
  if (cached) return cached;

  const [result] = await trace(
    'keys.findActiveByHash',
    async () =>
      await db
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
        )
  );

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

export async function touchApiKey(db: Db, key: ApiKey): Promise<void> {
  const now = new Date();

  if (key.lastUsedAt && now.getTime() - key.lastUsedAt.getTime() < 60_000) return;

  await trace(
    'keys.touch',
    async () => await db.update(tables.apiKey).set({ lastUsedAt: now }).where(eq(tables.apiKey.id, key.id))
  );
  key.lastUsedAt = now;
}
