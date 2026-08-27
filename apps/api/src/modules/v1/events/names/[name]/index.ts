import {
  EventNameSchema,
  EventVolumeRangeSchema,
  listEventNames,
  listEventVolume,
  listRecentEvents,
} from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const eventName = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events/names/:name',
    async ({ params, query, tenant }) => {
      const range = query.range ?? '7d';

      const [names, volume, recent] = await Promise.all([
        listEventNames(tenant.id),
        listEventVolume(tenant.id, range, params.name),
        listRecentEvents(tenant.id, { name: params.name, limit: 20 }),
      ]);

      const summary = names.find((entry) => entry.name === params.name);
      if (!summary) {
        throw new NotFoundError('Event not found');
      }

      return Response.success(
        { ...summary, volume, samples: recent.items },
        { ignoreTransform: ['data'] }
      ).send();
    },
    {
      tenant: 'events:read',
      params: t.Object({ name: EventNameSchema }),
      query: t.Object({ range: t.Optional(EventVolumeRangeSchema) }),
    }
  );
