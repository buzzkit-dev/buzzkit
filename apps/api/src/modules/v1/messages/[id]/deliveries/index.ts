import { DELIVERY_STATUSES, listDeliveries, serializeDelivery } from '@buzzkit/api/api/deliveries/index';
import { findMessage } from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messageDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages/:id/deliveries',
    async ({ db, params, query, tenant }) => {
      const message = await findMessage(db, tenant.id, params.id);
      const limit = clampLimit(query.limit);
      const afterId = resolveCursor(query.cursor, (id) => decodeEntityId('delivery', id));

      const rows = await listDeliveries(db, message.id, { limit, afterId, status: query.status });
      const page = toPage(rows, limit, (id) => encodeId('delivery', id));

      return Response.success(page.items.map(serializeDelivery), { entity: 'delivery' })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor })
        .send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
        status: t.Optional(t.Union(DELIVERY_STATUSES.map((status) => t.Literal(status)))),
      }),
    }
  );
