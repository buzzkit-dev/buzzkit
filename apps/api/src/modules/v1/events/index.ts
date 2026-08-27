import {
  EVENT_SOURCES,
  EventIdSchema,
  EventNameSchema,
  listRecentEvents,
  resolveEventCursor,
  resolveEventsBody,
  TrackEventsSchema,
  trackEvents,
} from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion } from '@buzzkit/api/libs/schemas';
import { clampLimit, PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const events = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events',
    async ({ query, tenant }) => {
      const { items, hasMore, nextCursor } = await listRecentEvents(tenant.id, {
        name: query.name,
        source: query.source,
        before: resolveEventCursor(query.cursor),
        after: query.after ? { receivedAt: query.after, id: query.afterId } : undefined,
        limit: clampLimit(query.limit),
      });

      return Response.success(items, { ignoreTransform: ['data'] })
        .paginated({ hasMore, nextCursor })
        .send();
    },
    {
      tenant: 'events:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        name: t.Optional(EventNameSchema),
        source: t.Optional(literalUnion(EVENT_SOURCES)),
        after: t.Optional(t.String({ format: 'date-time' })),
        afterId: t.Optional(EventIdSchema),
      }),
    }
  )
  .post(
    '/events',
    async ({ body, db, set, tenant }) => {
      const tracked = await trackEvents(db, tenant, { source: 'server', events: body.events });

      return Response.list(tracked, { ignoreTransform: ['data'] })
        .status(202)
        .send(set);
    },
    {
      tenant: 'events:write',
      body: TrackEventsSchema,
      parse: async ({ request }) => resolveEventsBody(await request.json()),
    }
  );
