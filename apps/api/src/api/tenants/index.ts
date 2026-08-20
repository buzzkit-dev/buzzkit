import { randomString } from '@buzzkit/api/api/keys/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, gt, isNull, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Tenant = typeof tables.tenant.$inferSelect;

export const TenantSlugSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  description: 'Lowercase letters, numbers and single hyphens. Stable identifier — pick carefully.',
});

export const TenantNameSchema = t.String({ minLength: 1, maxLength: 100 });

export const TenantMetadataSchema = t.Record(t.String(), t.Any(), {
  description: 'Free-form data, e.g. your own customer id',
});

export function serializeTenant(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isDefault: tenant.isDefault,
    metadata: tenant.metadata,
    identitySecret: tenant.identitySecret,
    requireIdentityVerification: tenant.requireIdentityVerification,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function assertTenantSlugAvailable(db: Db, workspaceId: number, slug: string): Promise<void> {
  const [existing] = await trace(
    'tenants.getBySlug',
    async () =>
      await db
        .select({ id: tables.tenant.id })
        .from(tables.tenant)
        .where(
          and(
            eq(tables.tenant.workspaceId, workspaceId),
            eq(tables.tenant.slug, slug),
            isNull(tables.tenant.deletedAt)
          )
        )
  );

  if (existing) {
    throw new ConflictError('A tenant with this slug already exists');
  }
}

export async function createTenant(
  db: Db,
  workspaceId: number,
  input: { name: string; slug: string; metadata?: Record<string, unknown> }
): Promise<Tenant> {
  const [tenant] = await trace(
    'tenants.create',
    async () =>
      await db
        .insert(tables.tenant)
        .values({
          workspaceId,
          name: input.name,
          slug: input.slug,
          metadata: input.metadata ?? {},
          identitySecret: randomString(32),
        })
        .returning()
  );

  return tenant!;
}

export async function listTenants(
  db: Db,
  workspaceId: number,
  options: { limit: number; afterId?: number }
): Promise<Tenant[]> {
  return await trace(
    'tenants.list',
    async () =>
      await db
        .select()
        .from(tables.tenant)
        .where(
          and(
            eq(tables.tenant.workspaceId, workspaceId),
            isNull(tables.tenant.deletedAt),
            options.afterId ? gt(tables.tenant.id, options.afterId) : undefined
          )
        )
        .orderBy(asc(tables.tenant.id))
        .limit(options.limit + 1)
  );
}

export async function findTenantBySlug(db: Db, workspaceId: number, slug: string): Promise<Tenant> {
  const [tenant] = await trace(
    'tenants.findBySlug',
    async () =>
      await db
        .select()
        .from(tables.tenant)
        .where(
          and(
            eq(tables.tenant.workspaceId, workspaceId),
            eq(tables.tenant.slug, slug),
            isNull(tables.tenant.deletedAt)
          )
        )
  );

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return tenant;
}

export async function updateTenant(
  db: Db,
  tenant: Tenant,
  patch: {
    name?: string;
    slug?: string;
    metadata?: Record<string, unknown>;
    requireIdentityVerification?: boolean;
  }
): Promise<Tenant> {
  const values: Record<string, unknown> = { ...patch };
  if (patch.requireIdentityVerification && !tenant.identitySecret) {
    values.identitySecret = randomString(32);
  }

  const [updated] = await trace(
    'tenants.update',
    async () => await db.update(tables.tenant).set(values).where(eq(tables.tenant.id, tenant.id)).returning()
  );

  return updated!;
}

export async function softDeleteTenant(db: Db, tenant: Tenant): Promise<Tenant> {
  if (tenant.isDefault) {
    throw new BadRequestError('The default tenant cannot be deleted');
  }

  return await trace('tenants.softDelete', async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.tenant)
        .set({ deletedAt: new Date() })
        .where(eq(tables.tenant.id, tenant.id))
        .returning();

      await tx
        .update(tables.apiKey)
        .set({ revokedAt: new Date() })
        .where(and(eq(tables.apiKey.tenantId, tenant.id), isNull(tables.apiKey.revokedAt)));

      return deleted!;
    })
  );
}
