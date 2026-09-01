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
  TenantSlugParamsSchema,
  TenantSlugSchema,
  updateTenant,
} from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const tenant = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .get(
    '/tenants/:tenantSlug',
    async ({ db, params, workspace }) => {
      const target = await findTenantBySlug(db, workspace.id, params.tenantSlug);
      return Response.success(serializeTenant(target), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:read' }
  )
  .patch(
    '/tenants/:tenantSlug',
    async ({ body, db, params, workspace, audit }) => {
      if (body.settings !== undefined) {
        assertValidTenantSettings(body.settings);
      }

      const target = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      if (
        body.name === undefined &&
        body.slug === undefined &&
        body.metadata === undefined &&
        body.settings === undefined
      ) {
        return Response.success(serializeTenant(target), { entity: 'tenant' }).send();
      }

      if (body.slug !== undefined && body.slug !== target.slug) {
        await assertTenantSlugAvailable(db, workspace.id, body.slug);
      }

      const updated = await updateTenant(db, target, body);

      await audit({
        event: 'tenant.updated',
        tenantId: target.id,
        target: { type: 'tenant', id: target.id },
        data: diffForEvent(
          { ...target, settings: resolveTenantSettings(target.settings) },
          { ...updated, settings: resolveTenantSettings(updated.settings) }
        ),
      });

      return Response.success(serializeTenant(updated), { entity: 'tenant' }).send();
    },
    {
      scope: 'tenants:write',
      params: TenantSlugParamsSchema,
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
      const target = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      const deleted = await softDeleteTenant(db, target);

      await audit({
        event: 'tenant.deleted',
        tenantId: target.id,
        target: { type: 'tenant', id: target.id },
        data: { name: target.name, slug: target.slug },
      });

      return Response.success(markDeleted(serializeTenant(deleted)), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:write' }
  );
