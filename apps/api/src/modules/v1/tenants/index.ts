import {
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
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

/**
 * The tenants API — the product promise for platforms: create a tenant per
 * customer and get fully isolated push infrastructure for each. Authenticated
 * by a workspace API key (which implies the workspace) or a dashboard session
 * with the `x-workspace` header.
 */
export const tenants = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Tenants'] } })
  .post(
    '/tenants',
    async ({ body, db, set, workspace }) => {
      await assertTenantSlugAvailable(db, workspace.id, body.slug);

      const tenant = await createTenant(db, workspace.id, body);

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
  )
  .get(
    '/tenants',
    async ({ db, query, workspace }) => {
      const limit = clampLimit(query.limit);
      const afterId = resolveCursor(query.cursor, (id) => decodeEntityId('tenant', id));

      const rows = await listTenants(db, workspace.id, { limit, afterId });
      const page = toPage(rows, limit, (id) => encodeId('tenant', id));

      return Response.success(page.items.map(serializeTenant), { entity: 'tenant' })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor })
        .send();
    },
    {
      scope: 'tenants:read',
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
      }),
    }
  );
