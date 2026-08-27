import { listEventNames } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const eventNames = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events/names',
    async ({ tenant }) => {
      const names = await listEventNames(tenant.id);

      return Response.list(names).send();
    },
    { tenant: 'events:read' }
  );
