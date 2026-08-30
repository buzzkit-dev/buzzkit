import { currentKeyVersion, rewrapSecret, sealSecret, unsealSecret } from '@buzzkit/api/libs/crypto';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, isNull, lt, sql, tables } from '@buzzkit/database';
import { SECRET_NAME_PATTERN } from '@buzzkit/schema/workflows';
import { t } from 'elysia';

export type Secret = typeof tables.secret.$inferSelect;

export const MAX_SECRETS_PER_TENANT = 50;

export const MAX_SECRET_BYTES = 4096;

export const SecretNameSchema = t.String({ pattern: SECRET_NAME_PATTERN.source, maxLength: 48 });

export const SecretValueSchema = t.Object({ value: t.String({ minLength: 1, maxLength: MAX_SECRET_BYTES }) });

function sealingContext(tenantId: number, name: string): string {
  return ['secret', 'v1', tenantId, name].join(':');
}

export function serializeSecret(secret: Secret) {
  return {
    id: secret.id,
    name: secret.name,
    version: secret.version,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

export function assertSecretName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new BadRequestError(
      'A secret name is a lowercase letter followed by letters, digits and underscores',
      {
        code: 'validation',
        param: 'name',
      }
    );
  }
}

export async function listSecrets(db: Db, tenantId: number): Promise<Secret[]> {
  return await trace(
    'secrets.list',
    async () =>
      await db
        .select()
        .from(tables.secret)
        .where(and(eq(tables.secret.tenantId, tenantId), isNull(tables.secret.deletedAt)))
        .orderBy(asc(tables.secret.name))
  );
}

async function selectSecret(db: Db, tenantId: number, name: string): Promise<Secret | null> {
  const [row] = await db
    .select()
    .from(tables.secret)
    .where(
      and(eq(tables.secret.tenantId, tenantId), eq(tables.secret.name, name), isNull(tables.secret.deletedAt))
    )
    .limit(1);
  return row ?? null;
}

export async function findSecret(db: Db, tenantId: number, name: string): Promise<Secret> {
  const row = await selectSecret(db, tenantId, name);
  if (!row) throw new NotFoundError('Secret not found');
  return row;
}

export async function putSecret(
  db: Db,
  tenantId: number,
  name: string,
  value: string
): Promise<{ secret: Secret; created: boolean }> {
  assertSecretName(name);
  return await trace('secrets.put', async () => {
    const sealed = await sealSecret(value, sealingContext(tenantId, name));
    const existing = await selectSecret(db, tenantId, name);
    if (existing) {
      const [updated] = await db
        .update(tables.secret)
        .set({ ...sealed, version: sql`${tables.secret.version} + 1` })
        .where(eq(tables.secret.id, existing.id))
        .returning();
      return { secret: updated as Secret, created: false };
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tables.secret)
      .where(and(eq(tables.secret.tenantId, tenantId), isNull(tables.secret.deletedAt)));
    if ((count ?? 0) >= MAX_SECRETS_PER_TENANT) {
      throw new BadRequestError(`A tenant holds at most ${MAX_SECRETS_PER_TENANT} secrets`, {
        code: 'secrets_limit',
        param: 'name',
      });
    }
    const [inserted] = await db
      .insert(tables.secret)
      .values({ tenantId, name, ...sealed })
      .returning();
    return { secret: inserted as Secret, created: true };
  });
}

export async function softDeleteSecret(db: Db, secretId: number): Promise<Secret> {
  const [deleted] = await db
    .update(tables.secret)
    .set({ deletedAt: new Date() })
    .where(eq(tables.secret.id, secretId))
    .returning();
  return deleted as Secret;
}

export async function readSecrets(db: Db, tenantId: number): Promise<Record<string, string>> {
  const rows = await listSecrets(db, tenantId);
  const entries = await Promise.all(
    rows.map(async (row) => [row.name, await unsealSecret(row, sealingContext(tenantId, row.name))] as const)
  );
  return Object.fromEntries(entries);
}

export async function rewrapSecrets(db: Db, limit: number): Promise<number> {
  const current = currentKeyVersion();
  const rows = await db
    .select()
    .from(tables.secret)
    .where(and(lt(tables.secret.keyVersion, current), isNull(tables.secret.deletedAt)))
    .limit(limit);
  for (const row of rows) {
    const sealed = await rewrapSecret(row, sealingContext(row.tenantId, row.name));
    await db
      .update(tables.secret)
      .set({ dekCiphertext: sealed.dekCiphertext, dekIv: sealed.dekIv, keyVersion: sealed.keyVersion })
      .where(eq(tables.secret.id, row.id));
  }
  return rows.length;
}
