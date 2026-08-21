import { findTenantBySlug, serializeIdentitySecret } from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const tenantIdentitySecret = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .get(
    '/tenants/:tenantSlug/identity-secret',
    async ({ db, params, workspace }) => {
      const tenant = await findTenantBySlug(db, workspace.id, params.tenantSlug);

      return Response.success(serializeIdentitySecret(tenant), { entity: 'tenant' }).send();
    },
    { scope: 'tenants:secrets' }
  );
