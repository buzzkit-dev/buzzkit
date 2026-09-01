import { DELIVERY_STATUSES, listDeliveries } from '@buzzkit/api/api/deliveries/index';
import { findMessage } from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messageDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages/:id/deliveries',
    async ({ db, params, query, tenant }) => {
      const message = await findMessage(db, tenant.id, params.id);
      const page = await listDeliveries(db, message.id, query);
      return Response.page(page, { entity: 'delivery' }).send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(t.Union(DELIVERY_STATUSES.map((status) => t.Literal(status)))),
      }),
    }
  );
