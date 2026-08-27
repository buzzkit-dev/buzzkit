import { findEndpoint, rotateEndpointSecret, serializeEndpoint } from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookRotate = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .post(
    '/workspaces/:workspaceSlug/webhooks/:id/rotate',
    async ({ audit, db, params, workspace }) => {
      const existing = await findEndpoint(db, workspace.id, params.id);
      const rotated = await rotateEndpointSecret(db, existing);

      await audit({
        event: 'webhook.secret_rotated',
        target: { type: 'webhook', id: existing.id },
        data: { url: existing.url },
      });

      return Response.success(serializeEndpoint(rotated, { secret: true })).send();
    },
    { scope: 'webhooks:write' }
  );
