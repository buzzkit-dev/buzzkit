import { findDelivery, listAttempts, serializeAttempt } from '@buzzkit/api/api/deliveries/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const deliveryAttempts = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Deliveries'] } })
  .get(
    '/deliveries/:id/attempts',
    async ({ db, params, tenant }) => {
      const delivery = await findDelivery(db, tenant.id, params.id);
      const attempts = await listAttempts(db, delivery.id);

      return Response.list(attempts.map(serializeAttempt), {
        ignoreTransform: ['request', 'response'],
      }).send();
    },
    { tenant: 'messages:read' }
  );
