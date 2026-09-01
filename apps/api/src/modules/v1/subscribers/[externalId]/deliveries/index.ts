import { listSubscriberDeliveries } from '@buzzkit/api/api/deliveries/index';
import { ExternalIdParamsSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia from 'elysia';

export const subscriberDeliveries = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Deliveries'] } })
  .get(
    '/subscribers/:externalId/deliveries',
    async ({ db, params, query, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const page = await listSubscriberDeliveries(db, tenant.id, subscriber.id, query);
      return Response.page(page, { entity: 'delivery', ignoreTransform: ['message'] }).send();
    },
    {
      tenant: 'messages:read',
      params: ExternalIdParamsSchema,
      query: PaginationQuerySchema,
    }
  );
