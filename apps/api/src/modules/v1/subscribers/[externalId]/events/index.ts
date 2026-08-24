import { listSubscriberEvents } from '@buzzkit/api/api/events/index';
import {
  ExternalIdSchema,
  findSubscriberByExternalId,
  listSubscriptionIds,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema, resolveCursor } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscriberEvents = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/subscribers/:externalId/events',
    async ({ db, params, query, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const subscriptionIds = await listSubscriptionIds(db, subscriber.id);
      const limit = clampLimit(query.limit);
      const beforeId = resolveCursor(query.cursor, (id) => decodeEntityId('event', id));

      const { items, hasMore, nextCursor, total } = await listSubscriberEvents(
        db,
        tenant.id,
        subscriber,
        subscriptionIds,
        { limit, beforeId }
      );

      return Response.success(items, { ignoreTransform: ['data'], entity: 'event' })
        .paginated({ hasMore, nextCursor, total })
        .send();
    },
    {
      tenant: 'subscribers:read',
      params: t.Object({ externalId: ExternalIdSchema }),
      query: t.Object({ ...PaginationQuerySchema.properties }),
    }
  );
