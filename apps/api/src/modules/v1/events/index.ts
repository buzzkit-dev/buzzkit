import {
  ListEventsQuerySchema,
  listRecentEvents,
  resolveEventsBody,
  TrackEventsSchema,
  trackEvents,
} from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

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
      query: ListEventsQuerySchema,
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
