import {
  findCredential,
  serializeCredential,
  softDeleteCredential,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const credential = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .get(
    '/credentials/:id',
    async ({ db, params, tenant }) => {
      const target = await findCredential(db, tenant.id, params.id);
      return Response.success(serializeCredential(target), { entity: 'credential' }).send();
    },
    { tenant: 'credentials:read' }
  )
  .delete(
    '/credentials/:id',
    async ({ db, params, tenant, audit }) => {
      const target = await findCredential(db, tenant.id, params.id);

      const deleted = await softDeleteCredential(db, target.id);

      await audit({
        event: 'credential.revoked',
        tenantId: tenant.id,
        target: { type: 'credential', id: target.id },
        data: { provider: target.provider, environment: target.environment },
      });

      return Response.success(markDeleted(serializeCredential(deleted)), { entity: 'credential' }).send();
    },
    { tenant: 'credentials:write' }
  );
