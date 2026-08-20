import { listCredentials } from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const credentials = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .get(
    '/credentials',
    async ({ db, tenant }) => {
      const rows = await listCredentials(db, tenant.id);

      return Response.success(rows, { entity: 'credential' }).send();
    },
    { tenant: 'credentials:read' }
  );
