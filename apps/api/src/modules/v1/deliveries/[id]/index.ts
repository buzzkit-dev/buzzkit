import { findDelivery, serializeDelivery } from '@buzzkit/api/api/deliveries/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const delivery = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Deliveries'] } })
  .get(
    '/deliveries/:id',
    async ({ db, params, tenant }) => {
      const delivery = await findDelivery(db, tenant.id, params.id);

      return Response.success(serializeDelivery(delivery), { entity: 'delivery' }).send();
    },
    { tenant: 'messages:read' }
  );
