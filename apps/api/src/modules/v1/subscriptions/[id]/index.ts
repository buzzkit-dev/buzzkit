import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import {
  findSubscriberById,
  findSubscription,
  resolveSubscriptionEventData,
  serializeSubscription,
  softDeleteSubscription,
  updateSubscriptionEnabled,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
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

      const updated = await updateSubscriptionEnabled(db, target.id, body.enabled);

      if (target.enabled !== body.enabled) {
        await recordSystemEvents(tenant.id, subscriber, [
          {
            name: body.enabled ? 'subscription.unmuted' : 'subscription.muted',
            data: resolveSubscriptionEventData(updated, subscriber.externalId),
          },
        ]);
      }

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

      const deleted = await softDeleteSubscription(db, target.id);

      await recordSystemEvents(tenant.id, subscriber, [
        { name: 'subscription.removed', data: resolveSubscriptionEventData(target, subscriber.externalId) },
      ]);

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
