import {
  findTenantBySlug,
  rotateTenantIdentitySecret,
  serializeIdentitySecret,
} from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const tenantIdentitySecretRotate = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .post(
    '/tenants/:tenantSlug/identity-secret/rotate',
    async ({ db, params, workspace, event }) => {
      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      const rotated = await rotateTenantIdentitySecret(db, tenant);

      await event({
        event: 'tenant.identity_secret_rotated',
        tenantId: tenant.id,
        target: { type: 'tenant', id: tenant.id },
        data: {},
      });

      return Response.success(serializeIdentitySecret(rotated), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:secrets' }
  );
