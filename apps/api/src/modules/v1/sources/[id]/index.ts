import { diffForEvent } from '@buzzkit/api/api/audit/index';
import {
  findSource,
  serializeSource,
  softDeleteSource,
  UpdateSourceSchema,
  updateSource,
} from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

function sourceIdOf(id: string): number {
  const decoded = decodeEntityId('source', id);
  if (decoded === undefined) throw new NotFoundError('Source not found');
  return decoded;
}

export const source = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .get(
    '/sources/:id',
    async ({ db, params, tenant }) => {
      const target = await findSource(db, tenant.id, sourceIdOf(params.id));
      return Response.success(serializeSource(target, params.id), { entity: 'source' }).send();
    },
    { tenant: 'sources:read' }
  )
  .patch(
    '/sources/:id',
    async ({ db, params, body, tenant, audit }) => {
      const target = await findSource(db, tenant.id, sourceIdOf(params.id));
      const updated = await updateSource(db, target, body);
      const { changes, previousAttributes } = diffForEvent(target, updated, [
        'updatedAt',
        'lastDeliveryAt',
        'secretCiphertext',
        'secretIv',
        'dekCiphertext',
        'dekIv',
        'keyVersion',
      ]);
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
      const target = await findSource(db, tenant.id, sourceIdOf(params.id));
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
