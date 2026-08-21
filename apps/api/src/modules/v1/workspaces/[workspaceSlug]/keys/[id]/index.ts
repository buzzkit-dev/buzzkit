import { findApiKey, maskApiKey, revokeApiKey } from '@buzzkit/api/api/keys/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const key = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .get(
    '/workspaces/:workspaceSlug/keys/:id',
    async ({ db, params, workspace }) => {
      const key = await findApiKey(db, workspace.id, params.id);

      return Response.success(maskApiKey(key), { entity: 'key' }).send();
    },
    { scope: 'keys:read' }
  )
  .delete(
    '/workspaces/:workspaceSlug/keys/:id',
    async ({ db, params, workspace, event }) => {
      const target = await findApiKey(db, workspace.id, params.id);

      const revoked = await revokeApiKey(db, target.id);

      await event({
        event: 'key.revoked',
        target: { type: 'key', id: target.id },
        data: { name: target.name, kind: target.kind },
      });

      return Response.success(maskApiKey(revoked), { entity: 'key' }).send();
    },
    { scope: 'keys:write' }
  );
