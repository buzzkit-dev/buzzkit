import { findSource, listSourceDeliveries } from '@buzzkit/api/api/sources/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const sourceDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Sources'] } })
  .get(
    '/sources/:id/deliveries',
    async ({ db, params, query, tenant }) => {
      const target = await findSource(db, tenant.id, params.id);
      const page = await listSourceDeliveries(db, target.id, query);
      return Response.page(page, { entity: 'sourceDelivery', ignoreTransform: ['payload'] }).send();
    },
    {
      tenant: 'sources:read',
      query: t.Object({ ...PaginationQuerySchema.properties, outcome: t.Optional(t.String()) }),
    }
  );
