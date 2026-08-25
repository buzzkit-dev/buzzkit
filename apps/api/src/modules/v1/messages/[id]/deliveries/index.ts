import {
  countDeliveries,
  DELIVERY_STATUSES,
  listDeliveries,
  serializeMessageDelivery,
} from '@buzzkit/api/api/deliveries/index';
import { findMessage } from '@buzzkit/api/api/messages/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const messageDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Messages'] } })
  .get(
    '/messages/:id/deliveries',
    async ({ db, params, query, tenant }) => {
      const message = await findMessage(db, tenant.id, params.id);
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('delivery', id));

      const [rows, total] = await Promise.all([
        listDeliveries(db, message.id, { limit, beforeId, status: query.status }),
        countDeliveries(db, message.id, query.status),
      ]);
      const page = toPage(
        rows.map((row) => ({ ...row, id: row.delivery.id })),
        limit,
        (id) => encodeId('delivery', id)
      );

      return Response.success(page.items.map(serializeMessageDelivery), { entity: 'delivery' })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    {
      tenant: 'messages:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(t.Union(DELIVERY_STATUSES.map((status) => t.Literal(status)))),
      }),
    }
  );
