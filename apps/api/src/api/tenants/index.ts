import { purgeApiKeyCacheForTenant, randomString } from '@buzzkit/api/api/keys/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { trace } from '@buzzkit/api/libs/telemetry';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import { and, type Db, desc, eq, isNull, lt, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Tenant = typeof tables.tenant.$inferSelect;

export const TenantSlugSchema = SlugSchema;

export const TenantNameSchema = NameSchema;

export const TenantMetadataSchema = t.Record(t.String(), t.Any(), {
  description: 'Free-form data, e.g. your own customer id',
});

export const TenantSettingsSchema = t.Object(
  {},
  {
    additionalProperties: true,
    description: 'Structured tenant settings — validated against the settings catalog',
  }
);

const SETTINGS_CATALOG: Record<string, Record<string, 'boolean'>> = {
  identity: { requireVerification: 'boolean' },
  'channels.push': { enabled: 'boolean' },
  'channels.email': { enabled: 'boolean' },
};

export function assertValidTenantSettings(patch: unknown): asserts patch is TenantSettingsPatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new BadRequestError('settings must be an object');
  }

  const groups = new Map<string, unknown>();
  for (const [group, value] of Object.entries(patch)) {
    if (group === 'channels') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestError('settings.channels must be an object');
      }
      for (const [channel, channelValue] of Object.entries(value)) {
        groups.set(`channels.${channel}`, channelValue);
      }
    } else {
      groups.set(group, value);
    }
  }

  for (const [path, value] of groups) {
    const catalog = SETTINGS_CATALOG[path];
    if (!catalog) {
      throw new BadRequestError(`Unknown setting group 'settings.${path}'`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestError(`settings.${path} must be an object`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const expected = catalog[key];
      if (!expected) {
        throw new BadRequestError(`Unknown setting 'settings.${path}.${key}'`);
      }
      if (typeof entry !== expected) {
        throw new BadRequestError(`settings.${path}.${key} must be a ${expected}`);
      }
    }
  }
}

export type TenantSettings = {
  identity: { requireVerification: boolean };
  channels: Record<'push' | 'email', { enabled: boolean }>;
};

type TenantSettingsPatch = {
  identity?: { requireVerification?: boolean };
  channels?: Partial<Record<'push' | 'email', { enabled?: boolean }>>;
};

export function resolveTenantSettings(raw: unknown): TenantSettings {
  const stored = (raw ?? {}) as TenantSettingsPatch;
  return {
    identity: { requireVerification: false, ...stored.identity },
    channels: {
      push: { enabled: true, ...stored.channels?.push },
      email: { enabled: true, ...stored.channels?.email },
    },
  };
}

export function mergeTenantSettings(current: unknown, patch: TenantSettingsPatch): TenantSettingsPatch {
  const stored = (current ?? {}) as TenantSettingsPatch;
  return {
    ...stored,
    ...(patch.identity ? { identity: { ...stored.identity, ...patch.identity } } : {}),
    ...(patch.channels
      ? {
          channels: {
            ...stored.channels,
            ...(patch.channels.push ? { push: { ...stored.channels?.push, ...patch.channels.push } } : {}),
            ...(patch.channels.email
              ? { email: { ...stored.channels?.email, ...patch.channels.email } }
              : {}),
          },
        }
      : {}),
  };
}

export const MAX_TENANT_METADATA_BYTES = 16 * 1024;

export function assertTenantMetadataSize(metadata: Record<string, unknown> | undefined): void {
  assertJsonSize(metadata, MAX_TENANT_METADATA_BYTES, 'metadata must serialize to 16KB or less', {
    code: 'metadata_too_large',
    param: 'metadata',
  });
}

export function serializeIdentitySecret(tenant: Tenant) {
  return { id: tenant.id, identitySecret: tenant.identitySecret, updatedAt: tenant.updatedAt };
}

export async function rotateTenantIdentitySecret(db: Db, tenant: Tenant): Promise<Tenant> {
  const [rotated] = await trace(
    'tenants.rotateIdentitySecret',
    async () =>
      await db
        .update(tables.tenant)
        .set({ identitySecret: randomString(32) })
        .where(eq(tables.tenant.id, tenant.id))
        .returning()
  );
  return rotated!;
}

export function serializeTenant(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isDefault: tenant.isDefault,
    metadata: tenant.metadata,
    settings: resolveTenantSettings(tenant.settings),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function assertTenantSlugAvailable(db: Db, workspaceId: number, slug: string): Promise<void> {
  const [existing] = await trace(
    'tenants.findBySlug',
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
    throw new ConflictError('A tenant with this slug already exists', { code: 'slug_taken', param: 'slug' });
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
  options: { limit: number; beforeId?: number }
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
            options.beforeId ? lt(tables.tenant.id, options.beforeId) : undefined
          )
        )
        .orderBy(desc(tables.tenant.id))
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
    throw new NotFoundError('Tenant not found', { code: 'tenant_not_found' });
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

  const [updated] = await trace(
    'tenants.update',
    async () => await db.update(tables.tenant).set(values).where(eq(tables.tenant.id, tenant.id)).returning()
  );
  await purgeApiKeyCacheForTenant(db, tenant.id);

  return updated!;
}

export async function softDeleteTenant(db: Db, tenant: Tenant): Promise<Tenant> {
  if (tenant.isDefault) {
    throw new ConflictError('The default tenant cannot be deleted', { code: 'default_tenant_immutable' });
  }

  const deleted = await trace('tenants.softDelete', async () =>
    db.transaction(async (tx) => {
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
    })
  );

  await purgeApiKeyCacheForTenant(db, tenant.id);

  return deleted;
}
