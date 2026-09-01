import {
  findSubscriberById,
  findSubscription,
  serializeSubscription,
  softDeleteSubscription,
  updateSubscriptionEnabled,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscription = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscriptions'] } })
  .get(
    '/subscriptions/:id',
    async ({ db, params, tenant }) => {
      const target = await findSubscription(db, tenant.id, params.id);
      return Response.success(
        { ...serializeSubscription(target), subscriberId: encodeId('subscriber', target.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    { tenant: 'subscriptions:read' }
  )
  .patch(
    '/subscriptions/:id',
    async ({ body, db, params, tenant }) => {
      const target = await findSubscription(db, tenant.id, params.id);
      const subscriber = await findSubscriberById(db, tenant.id, target.subscriberId);

      const updated = await updateSubscriptionEnabled(db, tenant.id, target, subscriber, body.enabled);

      return Response.success(
        { ...serializeSubscription(updated), subscriberId: encodeId('subscriber', updated.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    {
      tenant: 'subscriptions:write',
      body: t.Object({ enabled: t.Boolean() }),
    }
  )
  .delete(
    '/subscriptions/:id',
    async ({ db, params, tenant }) => {
      const target = await findSubscription(db, tenant.id, params.id);
      const subscriber = await findSubscriberById(db, tenant.id, target.subscriberId);

      const deleted = await softDeleteSubscription(db, tenant.id, target, subscriber);

      return Response.success(
        markDeleted({
          ...serializeSubscription(deleted),
          subscriberId: encodeId('subscriber', deleted.subscriberId),
        }),
        { entity: 'subscription' }
      ).send();
    },
    { tenant: 'subscriptions:write' }
  );
