import { createDefaultClientKey, purgeApiKeyCacheForTenant, randomString } from '@buzzkit/api/api/keys/index';
import { countRows } from '@buzzkit/api/libs/database';
import { ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import { clampLimit, type Page, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, isNull, lt, tables } from '@buzzkit/database';
import { MAX_TENANT_METADATA_BYTES } from './constants';
import { serializeTenant } from './serialize';
import { mergeTenantSettings } from './settings';
import type { Tenant, TenantSettingsPatch } from './types';

export * from './constants';
export * from './schemas';
export * from './serialize';
export * from './settings';
export type * from './types';

export function assertTenantMetadataSize(metadata: Record<string, unknown> | undefined): void {
  assertJsonSize(metadata, MAX_TENANT_METADATA_BYTES, 'metadata must serialize to 16KB or less', {
    code: 'metadata_too_large',
    param: 'metadata',
  });
}

export async function assertTenantSlugAvailable(db: Db, workspaceId: number, slug: string): Promise<void> {
  const [existing] = await trace('tenants.findBySlug', async () => {
    return await db
      .select({ id: tables.tenant.id })
      .from(tables.tenant)
      .where(
        and(
          eq(tables.tenant.workspaceId, workspaceId),
          eq(tables.tenant.slug, slug),
          isNull(tables.tenant.deletedAt)
        )
      );
  });

  if (existing) {
    throw new ConflictError('A tenant with this slug already exists', { code: 'slug_taken', param: 'slug' });
  }
}

export async function listTenants(
  db: Db,
  workspaceId: number,
  options: { cursor?: string; limit?: number } = {}
): Promise<Page<ReturnType<typeof serializeTenant>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('tenant', id));

  const [rows, total] = await Promise.all([
    trace('tenants.list', async () => {
      return await db
        .select()
        .from(tables.tenant)
        .where(
          and(
            eq(tables.tenant.workspaceId, workspaceId),
            isNull(tables.tenant.deletedAt),
            beforeId !== undefined ? lt(tables.tenant.id, beforeId) : undefined
          )
        )
        .orderBy(desc(tables.tenant.id))
        .limit(limit + 1);
    }),
    countTenants(db, workspaceId),
  ]);

  return { ...toPage(rows.map(serializeTenant), limit, (id) => encodeId('tenant', id)), total };
}

export async function countTenants(db: Db, workspaceId: number): Promise<number> {
  return await trace('tenants.count', async () => {
    return await countRows(
      db,
      tables.tenant,
      and(eq(tables.tenant.workspaceId, workspaceId), isNull(tables.tenant.deletedAt))
    );
  });
}

export async function findTenantBySlug(db: Db, workspaceId: number, slug: string): Promise<Tenant> {
  const [tenant] = await trace('tenants.findBySlug', async () => {
    return await db
      .select()
      .from(tables.tenant)
      .where(
        and(
          eq(tables.tenant.workspaceId, workspaceId),
          eq(tables.tenant.slug, slug),
          isNull(tables.tenant.deletedAt)
        )
      );
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found', { code: 'tenant_not_found' });
  }
  return tenant;
}

export async function findTenantById(db: Db, tenantId: number): Promise<Tenant> {
  const [tenant] = await trace('tenants.findById', async () => {
    return await db
      .select()
      .from(tables.tenant)
      .where(and(eq(tables.tenant.id, tenantId), isNull(tables.tenant.deletedAt)));
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found', { code: 'tenant_not_found' });
  }
  return tenant;
}

export async function createTenant(
  db: Db,
  workspaceId: number,
  input: { name: string; slug: string; metadata?: Record<string, unknown> },
  createdByUserId: string | null
): Promise<Tenant> {
  return await trace('tenants.create', async () => {
    return await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tables.tenant)
        .values({
          workspaceId,
          name: input.name,
          slug: input.slug,
          metadata: input.metadata ?? {},
          identitySecret: randomString(32),
        })
        .returning();

      await createDefaultClientKey(tx, workspaceId, tenant!.id, createdByUserId);
      return tenant!;
    });
  });
}

export async function updateTenant(
  db: Db,
  tenant: Tenant,
  patch: {
    name?: string;
    slug?: string;
    metadata?: Record<string, unknown>;
    settings?: TenantSettingsPatch;
  }
): Promise<Tenant> {
  assertTenantMetadataSize(patch.metadata);
  if (patch.slug !== undefined && patch.slug !== tenant.slug && tenant.isDefault) {
    throw new ConflictError('The default tenant keeps its slug', {
      code: 'default_tenant_immutable',
      param: 'slug',
    });
  }

  const values: Partial<typeof tables.tenant.$inferInsert> = {
    name: patch.name,
    slug: patch.slug,
    metadata: patch.metadata,
  };
  if (patch.settings) {
    values.settings = mergeTenantSettings(tenant.settings, patch.settings);
    if (patch.settings.identity?.requireVerification && !tenant.identitySecret) {
      values.identitySecret = randomString(32);
    }
  }

  const [updated] = await trace('tenants.update', async () => {
    return await db.update(tables.tenant).set(values).where(eq(tables.tenant.id, tenant.id)).returning();
  });
  await purgeApiKeyCacheForTenant(db, tenant.id);

  return updated!;
}

export async function softDeleteTenant(db: Db, tenant: Tenant): Promise<Tenant> {
  if (tenant.isDefault) {
    throw new ConflictError('The default tenant cannot be deleted', { code: 'default_tenant_immutable' });
  }

  const deleted = await trace('tenants.softDelete', async () => {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tables.tenant)
        .set({ deletedAt: new Date() })
        .where(eq(tables.tenant.id, tenant.id))
        .returning();

      await tx
        .update(tables.apiKey)
        .set({ revokedAt: new Date() })
        .where(and(eq(tables.apiKey.tenantId, tenant.id), isNull(tables.apiKey.revokedAt)));
      return row!;
    });
  });

  await purgeApiKeyCacheForTenant(db, tenant.id);

  return deleted;
}

export async function rotateTenantIdentitySecret(db: Db, tenant: Tenant): Promise<Tenant> {
  const [rotated] = await trace('tenants.rotateIdentitySecret', async () => {
    return await db
      .update(tables.tenant)
      .set({ identitySecret: randomString(32) })
      .where(eq(tables.tenant.id, tenant.id))
      .returning();
  });
  return rotated!;
}
