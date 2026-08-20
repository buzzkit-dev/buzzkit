import {
  assertTenantSlugAvailable,
  findTenantBySlug,
  serializeTenant,
  softDeleteTenant,
  TenantMetadataSchema,
  TenantNameSchema,
  TenantSlugSchema,
  updateTenant,
} from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const tenant = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .get(
    '/tenants/:tenantSlug',
    async ({ db, params, workspace }) => {
      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      return Response.success(serializeTenant(tenant), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:read' }
  )
  .patch(
    '/tenants/:tenantSlug',
    async ({ body, db, params, workspace }) => {
      if (body.name === undefined && body.slug === undefined && body.metadata === undefined) {
        throw new BadRequestError('Nothing to update');
      }

      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      if (body.slug !== undefined && body.slug !== tenant.slug) {
        if (tenant.isDefault) {
          throw new BadRequestError('The default tenant keeps its slug');
        }
        await assertTenantSlugAvailable(db, workspace.id, body.slug);
      }

      const updated = await updateTenant(db, tenant.id, body);

      return Response.success(serializeTenant(updated), { entity: 'tenant' }).send();
    },
    {
      scope: 'tenants:write',
      body: t.Object({
        name: t.Optional(TenantNameSchema),
        slug: t.Optional(TenantSlugSchema),
        metadata: t.Optional(TenantMetadataSchema),
      }),
    }
  )
  .delete(
    '/tenants/:tenantSlug',
    async ({ db, params, workspace }) => {
      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      const deleted = await softDeleteTenant(db, tenant);

      return Response.success(serializeTenant(deleted), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:write' }
  );
