import {
  findEndpoint,
  listDeliveries,
  serializeDelivery,
  WebhookDeliveryStatusSchema,
} from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const webhookDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/:id/deliveries',
    async ({ db, params, query, workspace }) => {
      const endpoint = await findEndpoint(db, workspace.id, params.id);
      const { items, hasMore, nextCursor, total } = await listDeliveries(db, endpoint.id, query);

      return Response.success(items.map(serializeDelivery)).paginated({ hasMore, nextCursor, total }).send();
    },
    {
      scope: 'webhooks:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(WebhookDeliveryStatusSchema),
      }),
    }
  );
