import { env } from 'cloudflare:workers';
import {
  findDelivery,
  findEndpoint,
  resetDelivery,
  serializeDelivery,
} from '@buzzkit/api/api/webhooks/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const webhookReplay = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Webhooks'] } })
  .post(
    '/workspaces/:workspaceSlug/webhooks/:id/deliveries/:deliveryId/replay',
    async ({ audit, db, params, set, workspace }) => {
      const endpoint = await findEndpoint(db, workspace.id, params.id);

      if (endpoint.disabledAt !== null) {
        throw new BadRequestError('Enable the endpoint before replaying deliveries to it', {
          code: 'endpoint_disabled',
        });
      }

      const delivery = await findDelivery(db, endpoint.id, params.deliveryId);

      await resetDelivery(db, delivery.id);
      await env.WEBHOOKS.send({ kind: 'deliver', deliveryId: delivery.id });

      await audit({
        event: 'webhook.replayed',
        target: { type: 'webhook', id: endpoint.id },
        data: { deliveryId: params.deliveryId, url: endpoint.url },
      });

      return Response.success({ ...serializeDelivery(delivery), status: 'pending' as const })
        .status(202)
        .send(set);
    },
    { scope: 'webhooks:write' }
  );
