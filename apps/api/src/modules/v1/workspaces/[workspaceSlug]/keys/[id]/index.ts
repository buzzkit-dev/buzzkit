import { findApiKey, maskApiKey, revokeApiKey } from '@buzzkit/api/api/keys/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const key = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .get(
    '/workspaces/:workspaceSlug/keys/:id',
    async ({ db, params, workspace }) => {
      const target = await findApiKey(db, workspace.id, params.id);
      return Response.success(maskApiKey(target), { entity: 'key' }).send();
    },
    { scope: 'keys:read' }
  )
  .delete(
    '/workspaces/:workspaceSlug/keys/:id',
    async ({ db, params, workspace, audit }) => {
      const target = await findApiKey(db, workspace.id, params.id);

      const revoked = await revokeApiKey(db, target.id);

      await audit({
        event: 'key.revoked',
        target: { type: 'key', id: target.id },
        data: { name: target.name, kind: target.kind },
      });

      return Response.success(maskApiKey(revoked), { entity: 'key' }).send();
    },
    { scope: 'keys:write' }
  );
