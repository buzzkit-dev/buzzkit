import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, desc, eq, isNull, tables } from '@buzzkit/database';
import {
  SOURCE_PRESETS,
  type SourceMapping,
  type SourcePreset,
  type SourceProvider,
  type Verification,
} from '@buzzkit/schema/sources';
import { assertMapping, assertVerification } from './schemas';
import { sealSourceSecret } from './secrets';
import type { Source } from './types';

export * from './constants';
export * from './deliveries';
export * from './ingest';
export * from './schemas';
export * from './secrets';
export * from './serialize';
export type * from './types';
export * from './verify';

function presetOf(provider: string): SourcePreset {
  const preset = SOURCE_PRESETS[provider as SourceProvider];
  if (!preset) {
    throw new BadRequestError(`Unknown provider "${provider}"`, { code: 'validation', param: 'provider' });
  }
  return preset;
}

export async function listSources(db: Db, tenantId: number): Promise<Source[]> {
  return await db
    .select()
    .from(tables.source)
    .where(and(eq(tables.source.tenantId, tenantId), isNull(tables.source.deletedAt)))
    .orderBy(desc(tables.source.id));
}

export async function findSource(db: Db, tenantId: number, sourceSqid: string): Promise<Source> {
  const sourceId = decodeEntityId('source', sourceSqid);
  if (sourceId === undefined) throw new NotFoundError('Source not found');

  const [row] = await db
    .select()
    .from(tables.source)
    .where(
      and(
        eq(tables.source.id, sourceId),
        eq(tables.source.tenantId, tenantId),
        isNull(tables.source.deletedAt)
      )
    )
    .limit(1);
  if (!row) throw new NotFoundError('Source not found');

  return row;
}

export async function selectSourceForIngest(db: Db, sourceSqid: string): Promise<Source | null> {
  const sourceId = decodeEntityId('source', sourceSqid);
  if (sourceId === undefined) return null;

  const [row] = await db
    .select()
    .from(tables.source)
    .where(and(eq(tables.source.id, sourceId), isNull(tables.source.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function createSource(
  db: Db,
  tenantId: number,
  input: { name: string; provider: string; verification?: unknown; mapping?: unknown; secret?: string }
): Promise<Source> {
  const preset = presetOf(input.provider);
  const mapping = input.mapping ?? preset.mapping;
  assertMapping(mapping);
  const verification = input.verification ?? preset.verification;
  assertVerification(verification);

  return await trace('sources.create', async () => {
    const [inserted] = await db
      .insert(tables.source)
      .values({
        tenantId,
        name: input.name,
        provider: preset.provider,
        verification,
        mapping,
        status: 'unverified',
      })
      .returning();
    const created = inserted as Source;
    if (!input.secret) return created;

    const [updated] = await db
      .update(tables.source)
      .set({ ...(await sealSourceSecret(tenantId, created.id, input.secret)), status: 'active' })
      .where(eq(tables.source.id, created.id))
      .returning();
    return updated as Source;
  });
}

export async function updateSource(
  db: Db,
  source: Source,
  patch: {
    name?: string;
    provider?: string;
    verification?: unknown;
    mapping?: unknown;
    secret?: string;
    status?: 'active' | 'paused';
  }
): Promise<Source> {
  if (patch.mapping !== undefined) assertMapping(patch.mapping);
  if (patch.verification !== undefined) assertVerification(patch.verification);

  const provider = patch.provider === undefined ? undefined : presetOf(patch.provider).provider;
  if (patch.status === 'active' && !patch.secret && source.secretCiphertext === null) {
    throw new BadRequestError('A source needs a secret before it can be active', {
      code: 'source_unverified',
      param: 'status',
    });
  }

  const values: Partial<typeof tables.source.$inferInsert> = {
    name: patch.name,
    provider,
    verification: patch.verification as Verification | undefined,
    mapping: patch.mapping as SourceMapping | undefined,
    status: patch.status,
  };
  if (patch.secret) {
    Object.assign(values, await sealSourceSecret(source.tenantId, source.id, patch.secret));
    if (source.status === 'unverified' && !patch.status) values.status = 'active';
  }

  const [updated] = await db
    .update(tables.source)
    .set(values)
    .where(eq(tables.source.id, source.id))
    .returning();
  return updated as Source;
}

export async function softDeleteSource(db: Db, sourceId: number): Promise<Source> {
  const [deleted] = await db
    .update(tables.source)
    .set({ deletedAt: new Date() })
    .where(eq(tables.source.id, sourceId))
    .returning();
  return deleted as Source;
}
