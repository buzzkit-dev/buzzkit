import {
  EVENT_SOURCES,
  EventIdSchema,
  EventNameSchema,
  listRecentEvents,
  resolveEventsBody,
  TrackEventsSchema,
  trackEvents,
} from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion } from '@buzzkit/api/libs/schemas';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const events = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events',
    async ({ query, tenant }) => {
      const page = await listRecentEvents(tenant.id, query);
      return Response.page(page, { ignoreTransform: ['data'] }).send();
    },
    {
      tenant: 'events:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        name: t.Optional(EventNameSchema),
        source: t.Optional(literalUnion([...EVENT_SOURCES, 'webhook'] as const)),
        provider: t.Optional(t.String()),
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
