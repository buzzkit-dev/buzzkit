import { findWebhookEvent, serializeWebhookEvent } from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookEvent = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/events/:id',
    async ({ db, params, workspace }) => {
      const event = await findWebhookEvent(db, workspace.id, params.id);
      return Response.success(serializeWebhookEvent(event), { ignoreTransform: ['payload'] }).send();
    },
    { scope: 'webhooks:read' }
  );
