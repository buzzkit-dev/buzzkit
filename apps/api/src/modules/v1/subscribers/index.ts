import { listSubscribers } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const subscribers = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers',
    async ({ db, query, tenant }) => {
      const page = await listSubscribers(db, tenant.id, query);
      return Response.page(page, { ignoreTransform: ['attributes'] }).send();
    },
    {
      tenant: 'subscribers:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        search: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
      }),
    }
  );
