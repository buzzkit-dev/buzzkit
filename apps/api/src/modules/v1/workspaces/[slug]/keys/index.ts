import { createApiKey, listApiKeys, maskApiKey } from '@buzzkit/api/api/keys/index';
import { findTenantBySlug } from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { assertValidKeyScopes } from '@buzzkit/api/libs/scopes';
import Elysia, { t } from 'elysia';

export const keys = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .get(
    '/workspaces/:slug/keys',
    async ({ db, workspace }) => {
      const rows = await listApiKeys(db, workspace.id);

      return Response.success(rows, { entity: 'key' }).send();
    },
    { scope: 'keys:read' }
  )
  .post(
    '/workspaces/:slug/keys',
    async ({ body, db, set, workspace, user }) => {
      assertValidKeyScopes(body.scopes);

      const kind = body.kind ?? 'workspace';
      const tenant = kind === 'tenant' ? await findTenantBySlug(db, workspace.id, body.tenant ?? '') : null;

      const { key, secret } = await createApiKey(
        db,
        workspace.id,
        {
          name: body.name,
          kind,
          scopes: body.scopes,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          tenantId: tenant?.id,
        },
        user!.id
      );

      return Response.success({ ...maskApiKey(key), secret }, { entity: 'key' })
        .status(201)
        .send(set);
    },
    {
      scope: 'keys:write',
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        kind: t.Optional(t.Union([t.Literal('workspace'), t.Literal('tenant')])),
        tenant: t.Optional(t.String({ minLength: 1, description: 'Tenant slug — required for tenant keys' })),
        scopes: t.Array(t.String({ minLength: 1 }), { minItems: 1, maxItems: 32 }),
        expiresAt: t.Optional(t.String({ format: 'date-time' })),
      }),
    }
  );
