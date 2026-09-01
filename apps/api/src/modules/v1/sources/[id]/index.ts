import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  findSource,
  SOURCE_AUDIT_IGNORE,
  serializeSource,
  softDeleteSource,
  UpdateSourceSchema,
  updateSource,
} from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const source = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .get(
    '/sources/:id',
    async ({ db, params, tenant }) => {
      const target = await findSource(db, tenant.id, params.id);
      return Response.success(serializeSource(target, params.id), { entity: 'source' }).send();
    },
    { tenant: 'sources:read' }
  )
  .patch(
    '/sources/:id',
    async ({ db, params, body, tenant, audit }) => {
      const target = await findSource(db, tenant.id, params.id);
      const updated = await updateSource(db, target, body);
      const { changes, previousAttributes } = diffForEvent(target, updated, SOURCE_AUDIT_IGNORE);
      await audit({
        event: 'source.updated',
        tenantId: tenant.id,
        target: { type: 'source', id: target.id },
        data: {
          name: updated.name,
          changes,
          previousAttributes,
          ...(body.secret ? { secret: 'replaced' } : {}),
        },
      });

      return Response.success(serializeSource(updated, params.id), { entity: 'source' }).send();
    },
    { tenant: 'sources:write', body: UpdateSourceSchema }
  )
  .delete(
    '/sources/:id',
    async ({ db, params, tenant, audit }) => {
      const target = await findSource(db, tenant.id, params.id);
      const deleted = await softDeleteSource(db, target.id);
      await audit({
        event: 'source.deleted',
        tenantId: tenant.id,
        target: { type: 'source', id: target.id },
        data: { name: target.name, provider: target.provider },
      });
      return Response.success(markDeleted(serializeSource(deleted, params.id)), { entity: 'source' }).send();
    },
    { tenant: 'sources:write' }
  );
