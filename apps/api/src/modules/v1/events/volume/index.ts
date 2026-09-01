import { EventNameSchema, EventVolumeRangeSchema, listEventVolume } from '@buzzkit/api/api/events/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const eventVolume = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Events'] } })
  .get(
    '/events/volume',
    async ({ query, tenant }) => {
      const volume = await listEventVolume(tenant.id, query.range ?? '7d', query.name);
      return Response.success(volume).send();
    },
    {
      tenant: 'events:read',
      query: t.Object({ range: t.Optional(EventVolumeRangeSchema), name: t.Optional(EventNameSchema) }),
    }
  );
