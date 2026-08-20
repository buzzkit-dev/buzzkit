import {
  findSubscription,
  serializeSubscription,
  setSubscriptionEnabled,
  softDeleteSubscription,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscription = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscriptions'] } })
  .patch(
    '/subscriptions/:id',
    async ({ body, db, params, tenant, event }) => {
      const target = await findSubscription(db, tenant.id, params.id);

      const updated = await setSubscriptionEnabled(db, target.id, body.enabled);

      await event({
        event: 'subscription.updated',
        tenantId: tenant.id,
        target: { type: 'subscription', id: target.id },
        data: { channel: target.channel, enabled: body.enabled },
      });

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
    async ({ db, params, tenant, event }) => {
      const target = await findSubscription(db, tenant.id, params.id);

      const deleted = await softDeleteSubscription(db, target.id);

      await event({
        event: 'subscription.removed',
        tenantId: tenant.id,
        target: { type: 'subscription', id: target.id },
        data: { channel: target.channel, platform: target.platform },
      });

      return Response.success(
        { ...serializeSubscription(deleted), subscriberId: encodeId('subscriber', deleted.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    { tenant: 'subscriptions:write' }
  );
