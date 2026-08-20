import {
  findCredential,
  revalidateCredential,
  serializeCredential,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const credentialValidate = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .post(
    '/credentials/:id/validate',
    async ({ db, params, tenant, event }) => {
      const target = await findCredential(db, tenant.id, params.id);

      const validated = await revalidateCredential(db, target);

      await event({
        event: 'credential.validated',
        tenantId: tenant.id,
        target: { type: 'credential', id: target.id },
        data: { provider: target.provider, status: validated.status, lastError: validated.lastError },
      });

      return Response.success(serializeCredential(validated), { entity: 'credential' }).send();
    },
    { tenant: 'credentials:write' }
  );
