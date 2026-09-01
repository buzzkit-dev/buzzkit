import { createApiKey, listApiKeys, maskApiKey } from '@buzzkit/api/api/keys/index';
import { findTenantBySlug } from '@buzzkit/api/api/tenants/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { KeyKindSchema, NameSchema } from '@buzzkit/api/libs/schemas';
import { assertValidKeyScopes } from '@buzzkit/api/libs/scopes';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const keys = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .get(
    '/workspaces/:workspaceSlug/keys',
    async ({ db, query, workspace }) => {
      const page = await listApiKeys(db, workspace.id, query);
      return Response.page(page, { entity: 'key' }).send();
    },
    {
      scope: 'keys:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        kind: t.Optional(KeyKindSchema),
      }),
    }
  )
  .post(
    '/workspaces/:workspaceSlug/keys',
    async ({ body, db, set, workspace, user, audit }) => {
      const kind = body.kind ?? 'workspace';
      const scopes = body.scopes ?? [];

      if (kind === 'client') {
        if (scopes.length > 0) {
          throw new BadRequestError('Client keys have fixed capabilities — scopes cannot be granted');
        }
      } else {
        if (scopes.length === 0) {
          throw new BadRequestError('Scopes are required');
        }
        assertValidKeyScopes(scopes, kind);
      }

      if (kind !== 'workspace' && !body.tenant) {
        throw new BadRequestError('Tenant and client keys require a tenant', {
          code: 'tenant_required',
          param: 'tenant',
        });
      }
      let tenant: Awaited<ReturnType<typeof findTenantBySlug>> | null = null;
      if (kind !== 'workspace' && body.tenant) {
        tenant = await findTenantBySlug(db, workspace.id, body.tenant);
      }

      const { key, secret } = await createApiKey(
        db,
        workspace.id,
        {
          name: body.name,
          kind,
          scopes,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          tenantId: tenant?.id,
        },
        user!.id
      );

      await audit({
        event: 'key.created',
        target: { type: 'key', id: key.id },
        data: { name: key.name, kind: key.kind, scopes: key.scopes },
      });

      return Response.success({ ...maskApiKey(key), secret }, { entity: 'key' })
        .status(201)
        .send(set);
    },
    {
      scope: 'keys:write',
      body: t.Object({
        name: NameSchema,
        kind: t.Optional(KeyKindSchema),
        tenant: t.Optional(t.String({ minLength: 1, description: 'Tenant slug — required for tenant keys' })),
        scopes: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 32 })),
        expiresAt: t.Optional(t.String({ format: 'date-time' })),
      }),
    }
  );
