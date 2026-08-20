import { findApiKey, maskApiKey, revokeApiKey } from '@buzzkit/api/api/keys/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const key = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .delete(
    '/workspaces/:slug/keys/:id',
    async ({ db, params, workspace }) => {
      const target = await findApiKey(db, workspace.id, params.id);

      const revoked = await revokeApiKey(db, target.id);

      return Response.success(maskApiKey(revoked), { entity: 'key' }).send();
    },
    { scope: 'keys:write' }
  );
