import { listSubscriberTimeline } from '@buzzkit/api/api/events/index';
import { ExternalIdParamsSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscriberTimeline = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/subscribers/:externalId/timeline',
    async ({ db, params, query, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const page = await listSubscriberTimeline(tenant.id, subscriber, {
        cursor: query.cursor,
        limit: query.limit,
        name: query.name || undefined,
        source: query.source || undefined,
        provider: query.provider || undefined,
      });
      return Response.page(page, { ignoreTransform: ['data'] }).send();
    },
    {
      tenant: 'subscribers:read',
      params: ExternalIdParamsSchema,
      query: t.Object({
        ...PaginationQuerySchema.properties,
        name: t.Optional(t.String()),
        source: t.Optional(t.String()),
        provider: t.Optional(t.String()),
      }),
    }
  );
