import { webhookEventGroups } from '@buzzkit/api/api/webhooks/catalog';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookCatalog = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/catalog',
    () => Response.success({ groups: webhookEventGroups() }).send(),
    { scope: 'webhooks:read' }
  );
