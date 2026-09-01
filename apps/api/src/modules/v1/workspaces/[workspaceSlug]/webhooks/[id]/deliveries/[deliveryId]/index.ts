import {
  findEndpoint,
  findWebhookDelivery,
  listWebhookAttempts,
  selectWebhookEventById,
  serializeWebhookAttempt,
  serializeWebhookDelivery,
  serializeWebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookDelivery = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .get(
    '/workspaces/:workspaceSlug/webhooks/:id/deliveries/:deliveryId',
    async ({ db, params, workspace }) => {
      const endpoint = await findEndpoint(db, workspace.id, params.id);
      const delivery = await findWebhookDelivery(db, endpoint.id, params.deliveryId);

      const [attempts, event] = await Promise.all([
        listWebhookAttempts(db, delivery.id),
        selectWebhookEventById(db, delivery.eventId),
      ]);

      return Response.success(
        {
          ...serializeWebhookDelivery(delivery),
          attempts: attempts.map(serializeWebhookAttempt),
          event: event ? serializeWebhookEvent(event) : null,
        },
        { ignoreTransform: ['payload'] }
      ).send();
    },
    { scope: 'webhooks:read' }
  );
