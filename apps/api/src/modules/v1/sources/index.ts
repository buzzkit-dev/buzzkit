import {
  CreateSourceSchema,
  createSource,
  listSources,
  serializeSource,
} from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

export const sources = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .get(
    '/sources',
    async ({ db, tenant }) => {
      const rows = await listSources(db, tenant.id);
      const items = rows.map((row) => serializeSource(row, encodeId('source', row.id)));
      return Response.list(items, { entity: 'source', total: rows.length }).send();
    },
    { tenant: 'sources:read' }
  )
  .post(
    '/sources',
    async ({ db, body, tenant, audit, set }) => {
      const created = await createSource(db, tenant.id, body);
      await audit({
        event: 'source.created',
        tenantId: tenant.id,
        target: { type: 'source', id: created.id },
        data: { name: created.name, provider: created.provider },
      });
      set.status = 201;

      return Response.success(serializeSource(created, encodeId('source', created.id)), {
        entity: 'source',
      }).send();
    },
    { tenant: 'sources:write', body: CreateSourceSchema }
  );
