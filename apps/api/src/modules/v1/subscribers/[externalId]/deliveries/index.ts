import {
  countSubscriberDeliveries,
  listSubscriberDeliveries,
  serializeSubscriberDelivery,
} from '@buzzkit/api/api/deliveries/index';
import { ExternalIdSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscriberDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Deliveries'] } })
  .get(
    '/subscribers/:externalId/deliveries',
    async ({ db, params, query, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('delivery', id));

      const [rows, total] = await Promise.all([
        listSubscriberDeliveries(db, tenant.id, subscriber.id, { limit, beforeId }),
        countSubscriberDeliveries(db, tenant.id, subscriber.id),
      ]);
      const page = toPage(
        rows.map((row) => ({ ...row, id: row.delivery.id })),
        limit,
        (id) => encodeId('delivery', id)
      );

      return Response.success(page.items.map(serializeSubscriberDelivery), {
        entity: 'delivery',
        ignoreTransform: ['message'],
      })
        .paginated({ hasMore: page.hasMore, nextCursor: page.nextCursor, total })
        .send();
    },
    {
      tenant: 'messages:read',
      params: t.Object({ externalId: ExternalIdSchema }),
      query: t.Object({ ...PaginationQuerySchema.properties }),
    }
  );
