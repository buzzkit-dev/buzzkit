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
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const tenants = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .get(
    '/tenants',
    async ({ db, query, workspace }) => {
      const page = await listTenants(db, workspace.id, query);
      return Response.page(page, { entity: 'tenant' }).send();
    },
    {
      scope: 'tenants:read',
      query: PaginationQuerySchema,
    }
  )
  .post(
    '/tenants',
    async ({ body, db, set, workspace, user, audit }) => {
      await assertTenantSlugAvailable(db, workspace.id, body.slug);

      assertTenantMetadataSize(body.metadata);

      const tenant = await createTenant(db, workspace.id, body, user?.id ?? null);

      await audit({
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
