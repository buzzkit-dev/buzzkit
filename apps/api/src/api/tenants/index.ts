import { createDefaultClientKey, purgeApiKeyCacheForTenant, randomString } from '@buzzkit/api/api/keys/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { NameSchema, SlugSchema } from '@buzzkit/api/libs/schemas';
import { trace } from '@buzzkit/api/libs/telemetry';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import { and, count, type Db, desc, eq, isNull, lt, tables } from '@buzzkit/database';
import { isTimezone } from '@buzzkit/schema/workflows';
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

type SettingType = 'boolean';

const SETTINGS_CATALOG: Record<string, Record<string, SettingType>> = {
  identity: { requireVerification: 'boolean' },
  'channels.push': { enabled: 'boolean' },
  'channels.email': { enabled: 'boolean' },
};

const QUIET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertSendPolicyPatch(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('settings.sendPolicy must be an object');
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'dailyCap') {
      if (
        entry !== null &&
        (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1 || entry > 50)
      ) {
        throw new BadRequestError(
          'settings.sendPolicy.dailyCap must be a whole number from 1 to 50, or null'
        );
      }
    } else if (key === 'quietHours') {
      if (entry === null) continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestError('settings.sendPolicy.quietHours must be { from, to, timezone? } or null');
      }
      const quiet = entry as Record<string, unknown>;
      for (const bound of ['from', 'to'] as const) {
        if (typeof quiet[bound] !== 'string' || !QUIET_TIME_PATTERN.test(quiet[bound] as string)) {
          throw new BadRequestError(`settings.sendPolicy.quietHours.${bound} must be a time such as "22:00"`);
        }
      }
      if (quiet.from === quiet.to) {
        throw new BadRequestError('settings.sendPolicy.quietHours.from and .to cannot be the same time');
      }
      if (quiet.timezone !== undefined && quiet.timezone !== 'subscriber' && !isTimezone(quiet.timezone)) {
        throw new BadRequestError(
          'settings.sendPolicy.quietHours.timezone must be "subscriber" or an IANA timezone'
        );
      }
      const extras = Object.keys(quiet).filter((k) => !['from', 'to', 'timezone'].includes(k));
      if (extras.length > 0) {
        throw new BadRequestError(`Unknown setting 'settings.sendPolicy.quietHours.${extras[0]}'`);
      }
    } else {
      throw new BadRequestError(`Unknown setting 'settings.sendPolicy.${key}'`);
    }
  }
}

function assertSettingValue(path: string, key: string, expected: SettingType, entry: unknown): void {
  if (expected === 'boolean' && typeof entry !== 'boolean') {
    throw new BadRequestError(`settings.${path}.${key} must be a boolean`);
  }
}

export function assertValidTenantSettings(patch: unknown): asserts patch is TenantSettingsPatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new BadRequestError('settings must be an object');
  }

  const groups = new Map<string, unknown>();
  for (const [group, value] of Object.entries(patch)) {
    if (group === 'sendPolicy') {
      assertSendPolicyPatch(value);
      continue;
    }
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
      assertSettingValue(path, key, expected, entry);
    }
  }
}

export type QuietHours = { from: string; to: string; timezone: string };

export type SendPolicy = { quietHours: QuietHours | null; dailyCap: number | null };

export type TenantSettings = {
  identity: { requireVerification: boolean };
  channels: Record<'push' | 'email', { enabled: boolean }>;
  sendPolicy: SendPolicy;
};

type SendPolicyPatch = {
  quietHours?: { from: string; to: string; timezone?: string } | null;
  dailyCap?: number | null;
};

type TenantSettingsPatch = {
  identity?: { requireVerification?: boolean };
  channels?: Partial<Record<'push' | 'email', { enabled?: boolean }>>;
  sendPolicy?: SendPolicyPatch;
};

export function resolveTenantSettings(raw: unknown): TenantSettings {
  const stored = (raw ?? {}) as {
    identity?: TenantSettingsPatch['identity'];
    channels?: TenantSettingsPatch['channels'];
    sendPolicy?: SendPolicyPatch;
  };
  const quiet = stored.sendPolicy?.quietHours ?? null;
  return {
    identity: { requireVerification: false, ...stored.identity },
    channels: {
      push: { enabled: true, ...stored.channels?.push },
      email: { enabled: true, ...stored.channels?.email },
    },
    sendPolicy: {
      quietHours: quiet ? { from: quiet.from, to: quiet.to, timezone: quiet.timezone ?? 'subscriber' } : null,
      dailyCap: stored.sendPolicy?.dailyCap ?? null,
    },
  };
}

export function mergeTenantSettings(current: unknown, patch: TenantSettingsPatch): unknown {
  const stored = (current ?? {}) as {
    identity?: TenantSettingsPatch['identity'];
    channels?: TenantSettingsPatch['channels'];
    sendPolicy?: SendPolicyPatch;
  };
  return {
    ...stored,
    ...(patch.identity ? { identity: { ...stored.identity, ...patch.identity } } : {}),
    ...(patch.sendPolicy ? { sendPolicy: { ...stored.sendPolicy, ...patch.sendPolicy } } : {}),
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
  input: { name: string; slug: string; metadata?: Record<string, unknown> },
  createdByUserId: string | null
): Promise<Tenant> {
  return await trace('tenants.create', async () =>
    db.transaction(async (tx) => {
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
    })
  );
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

export async function countTenants(db: Db, workspaceId: number): Promise<number> {
  const [row] = await trace(
    'tenants.count',
    async () =>
      await db
        .select({ total: count() })
        .from(tables.tenant)
        .where(and(eq(tables.tenant.workspaceId, workspaceId), isNull(tables.tenant.deletedAt)))
  );
  return Number(row?.total ?? 0);
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
