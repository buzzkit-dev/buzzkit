import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  assertTenantSlugAvailable,
  assertValidTenantSettings,
  findTenantBySlug,
  resolveTenantSettings,
  serializeTenant,
  softDeleteTenant,
  TenantMetadataSchema,
  TenantNameSchema,
  TenantSettingsSchema,
  TenantSlugSchema,
  updateTenant,
} from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
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
    async ({ body, db, params, workspace, audit }) => {
      if (body.settings !== undefined) {
        assertValidTenantSettings(body.settings);
      }

      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      if (
        body.name === undefined &&
        body.slug === undefined &&
        body.metadata === undefined &&
        body.settings === undefined
      ) {
        return Response.success(serializeTenant(tenant), { entity: 'tenant' }).send();
      }

      if (body.slug !== undefined && body.slug !== tenant.slug) {
        await assertTenantSlugAvailable(db, workspace.id, body.slug);
      }

      const updated = await updateTenant(db, tenant, body);

      await audit({
        event: 'tenant.updated',
        tenantId: tenant.id,
        target: { type: 'tenant', id: tenant.id },
        data: diffForEvent(
          { ...tenant, settings: resolveTenantSettings(tenant.settings) },
          { ...updated, settings: resolveTenantSettings(updated.settings) }
        ),
      });

      return Response.success(serializeTenant(updated), { entity: 'tenant' }).send();
    },
    {
      scope: 'tenants:write',
      body: t.Object({
        name: t.Optional(TenantNameSchema),
        slug: t.Optional(TenantSlugSchema),
        metadata: t.Optional(TenantMetadataSchema),
        settings: t.Optional(TenantSettingsSchema),
      }),
    }
  )
  .delete(
    '/tenants/:tenantSlug',
    async ({ db, params, workspace, audit }) => {
      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      const deleted = await softDeleteTenant(db, tenant);

      await audit({
        event: 'tenant.deleted',
        tenantId: tenant.id,
        target: { type: 'tenant', id: tenant.id },
        data: { name: tenant.name, slug: tenant.slug },
      });

      return Response.success(markDeleted(serializeTenant(deleted)), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:write' }
  );
