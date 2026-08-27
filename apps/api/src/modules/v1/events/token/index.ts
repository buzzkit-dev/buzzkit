import { createEventsToken } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const eventsToken = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events/token',
    async ({ tenant }) => {
      const token = await createEventsToken(tenant.id);

      return Response.success(token).send();
    },
    { tenant: 'events:read' }
  );
