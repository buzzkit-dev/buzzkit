import { assertEventDataObjects, ClientTrackEventsSchema, trackEvents } from '@buzzkit/api/api/events/index';
import { resolveSystemAttributes } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const clientEvents = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/events',
    async ({ body, db, request, set, tenant }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      const tracked = await trackEvents(db, tenant, {
        source: body.source,
        events: body.events.map((event) => ({ ...event, externalId: body.externalId })),
        verifiedNow: verified,
        systemAttributes: resolveSystemAttributes(request),
      });

      return Response.list(tracked, { ignoreTransform: ['data'] })
        .status(202)
        .send(set);
    },
    {
      client: true,
      body: ClientTrackEventsSchema,
      parse: async ({ request }) => {
        const body: unknown = await request.json();
        assertEventDataObjects(body);
        return body;
      },
    }
  );
