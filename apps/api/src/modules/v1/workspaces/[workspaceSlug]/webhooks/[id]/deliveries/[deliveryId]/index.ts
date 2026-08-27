import {
  findDelivery,
  findEndpoint,
  findWebhookEventById,
  listAttempts,
  serializeAttempt,
  serializeDelivery,
  serializeWebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookDelivery = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/:id/deliveries/:deliveryId',
    async ({ db, params, workspace }) => {
      const endpoint = await findEndpoint(db, workspace.id, params.id);
      const delivery = await findDelivery(db, endpoint.id, params.deliveryId);

      const [attempts, event] = await Promise.all([
        listAttempts(db, delivery.id),
        findWebhookEventById(db, delivery.eventId),
      ]);

      return Response.success(
        {
          ...serializeDelivery(delivery),
          attempts: attempts.map(serializeAttempt),
          event: event ? serializeWebhookEvent(event) : null,
        },
        { ignoreTransform: ['payload'] }
      ).send();
    },
    { scope: 'webhooks:read' }
  );
