import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';

export type ApiKey = typeof tables.apiKey.$inferSelect;
export type ApiKeyKind = ApiKey['kind'];

export const WORKSPACE_KEY_PREFIX = 'bk_ws_';
export const TENANT_KEY_PREFIX = 'bk_tn_';

const SECRET_KEY_PREFIXES = [WORKSPACE_KEY_PREFIX, TENANT_KEY_PREFIX] as const;

const SECRET_LENGTH = 40;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function isApiKeyToken(token: string): boolean {
  return SECRET_KEY_PREFIXES.some((prefix) => token.startsWith(prefix));
}

export function randomString(length: number): string {
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      // 248 = 62 * 4 — reject the tail to keep the distribution uniform
      if (byte < 248) {
        chars.push(ALPHABET[byte % 62] as string);
        if (chars.length === length) break;
      }
    }
  }

  return chars.join('');
}

export function generateApiKeySecret(kind: ApiKeyKind): string {
  const prefix = kind === 'tenant' ? TENANT_KEY_PREFIX : WORKSPACE_KEY_PREFIX;
  return `${prefix}${randomString(SECRET_LENGTH)}`;
}

export function stripApiKeyPrefix(token: string): string {
  const prefix = SECRET_KEY_PREFIXES.find((p) => token.startsWith(p));
  return prefix ? token.slice(prefix.length) : token;
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stripApiKeyPrefix(secret)));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function maskApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    kind: key.kind,
    tenantId: key.tenantId,
    prefix: key.prefix,
    last4: key.last4,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
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

  if (input.kind === 'tenant' && !input.tenantId) {
    throw new BadRequestError('Tenant keys require a tenant');
  }

  const secret = generateApiKeySecret(input.kind);
  const keyHash = await hashApiKeySecret(secret);
  const prefixLength = (input.kind === 'tenant' ? TENANT_KEY_PREFIX : WORKSPACE_KEY_PREFIX).length;

  const [key] = await trace(
    'keys.create',
    async () =>
      await db
        .insert(tables.apiKey)
        .values({
          workspaceId,
          tenantId: input.kind === 'tenant' ? input.tenantId : null,
          name: input.name,
          kind: input.kind,
          keyHash,
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
    throw new BadRequestError('Invalid key identifier');
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

  return revoked!;
}

export async function findActiveApiKeyByHash(db: Db, keyHash: string) {
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

  if (result.key.kind === 'tenant' && !result.tenant) return null;

  return result;
}

export async function touchApiKey(db: Db, key: ApiKey): Promise<void> {
  const now = new Date();

  if (key.lastUsedAt && now.getTime() - key.lastUsedAt.getTime() < 60_000) return;

  await trace(
    'keys.touch',
    async () => await db.update(tables.apiKey).set({ lastUsedAt: now }).where(eq(tables.apiKey.id, key.id))
  );
}
