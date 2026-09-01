import { listSecrets, serializeSecret } from '@buzzkit/api/api/secrets/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const secrets = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Secrets'] } })
  .get(
    '/secrets',
    async ({ db, tenant }) => {
      const rows = await listSecrets(db, tenant.id);
      return Response.list(rows.map(serializeSecret), { entity: 'secret', total: rows.length }).send();
    },
    { tenant: 'secrets:read' }
  );
