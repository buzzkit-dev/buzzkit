import {
  assertTenantMetadataSize,
  assertTenantSlugAvailable,
  createTenant,
  listTenants,
  serializeTenant,
  TenantMetadataSchema,
  TenantNameSchema,
  TenantSlugSchema,
} from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const tenants = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .get(
    '/tenants',
    async ({ db, query, workspace }) => {
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('tenant', id));

      const rows = await listTenants(db, workspace.id, { limit, beforeId });
      const page = toPage(rows, limit, (id) => encodeId('tenant', id));

      return Response.success(page.items.map(serializeTenant), { entity: 'tenant' })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor })
        .send();
    },
    {
      scope: 'tenants:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
      }),
    }
  )
  .post(
    '/tenants',
    async ({ body, db, set, workspace, user, event }) => {
      await assertTenantSlugAvailable(db, workspace.id, body.slug);

      assertTenantMetadataSize(body.metadata);

      const tenant = await createTenant(db, workspace.id, body, user?.id ?? null);

      await event({
        event: 'tenant.created',
        tenantId: tenant.id,
        target: { type: 'tenant', id: tenant.id },
        data: { name: tenant.name, slug: tenant.slug },
      });

      return Response.success(serializeTenant(tenant), { entity: 'tenant' }).status(201).send(set);
    },
    {
      scope: 'tenants:write',
      body: t.Object({
        name: TenantNameSchema,
        slug: TenantSlugSchema,
        metadata: t.Optional(TenantMetadataSchema),
      }),
    }
  );
