import { findApiKey, maskApiKey, rotateApiKeySecret } from '@buzzkit/api/api/keys/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const keyRotate = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Keys'] } })
  .post(
    '/workspaces/:workspaceSlug/keys/:id/rotate',
    async ({ db, params, workspace, audit }) => {
      const target = await findApiKey(db, workspace.id, params.id);
      const { key, secret } = await rotateApiKeySecret(db, target);

      await audit({
        event: 'key.rotated',
        target: { type: 'key', id: target.id },
        data: { name: key.name, kind: key.kind },
      });

      return Response.success({ ...maskApiKey(key), secret }, { entity: 'key' }).send();
    },
    { scope: 'keys:write' }
  );
