import { listSubscriberTimeline } from '@buzzkit/api/api/events/index';
import { ExternalIdSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { clampLimit, PaginationQuerySchema, resolveCursor } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscriberTimeline = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/subscribers/:externalId/timeline',
    async ({ db, params, query, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const beforeSequence = resolveCursor(query.cursor, (cursor) =>
        /^\d+$/.test(cursor) ? Number(cursor) : undefined
      );

      const { items, hasMore, nextCursor } = await listSubscriberTimeline(tenant.id, subscriber, {
        beforeSequence,
        limit: clampLimit(query.limit),
      });

      return Response.success(items, { ignoreTransform: ['data'] })
        .paginated({ hasMore, nextCursor })
        .send();
    },
    {
      tenant: 'subscribers:read',
      params: t.Object({ externalId: ExternalIdSchema }),
      query: t.Object({ ...PaginationQuerySchema.properties }),
    }
  );
