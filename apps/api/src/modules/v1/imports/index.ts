import { ImportBodySchema, registerImport } from '@buzzkit/api/api/imports/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const imports = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .post(
    '/imports',
    async ({ body, db, tenant }) => {
      const result = await registerImport(db, tenant.id, body.rows);
      return Response.success(result).send();
    },
    { tenant: 'subscribers:write', body: ImportBodySchema }
  );
