import {
  ExternalIdSchema,
  findSubscriptionByEndpoint,
  registerSubscription,
  resolveSubscriptionInput,
  SubscriptionInputSchema,
  serializeSubscription,
  setSubscriptionEnabled,
  softDeleteSubscription,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const clientSubscriptions = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/subscriptions',
    async ({ body, db, set, tenant, clientEvent }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);
      const resolved = resolveSubscriptionInput(body);

      const { subscription, subscriptionCreated, subscriberCreated, subscriber } = await registerSubscription(
        db,
        tenant.id,
        {
          externalId: body.externalId,
          ...resolved,
          verifiedNow: verified,
        }
      );

      if (subscriptionCreated) {
        await clientEvent(subscriber.externalId)({
          event: 'subscription.created',
          tenantId: tenant.id,
          target: { type: 'subscription', id: subscription.id },
          data: {
            externalId: subscriber.externalId,
            channel: subscription.channel,
            platform: subscription.platform,
            subscriberCreated,
          },
        });
      }

      return Response.success(
        {
          ...serializeSubscription(subscription),
          subscriberId: encodeId('subscriber', subscription.subscriberId),
          externalId: subscriber.externalId,
        },
        { entity: 'subscription' }
      )
        .status(subscriptionCreated ? 201 : 200)
        .send(set);
    },
    {
      client: true,
      body: t.Composite([
        t.Object({
          externalId: ExternalIdSchema,
          identityHash: t.Optional(t.String({ maxLength: 128 })),
        }),
        SubscriptionInputSchema,
      ]),
    }
  )
  .patch(
    '/client/subscriptions',
    async ({ body, db, tenant, clientEvent }) => {
      const resolved = resolveSubscriptionInput(body);
      const subscription = await findSubscriptionByEndpoint(
        db,
        tenant.id,
        resolved.channel,
        resolved.endpoint
      );

      const updated = await setSubscriptionEnabled(db, subscription.id, body.enabled);

      await clientEvent(resolved.endpoint.slice(0, 8))({
        event: 'subscription.updated',
        tenantId: tenant.id,
        target: { type: 'subscription', id: subscription.id },
        data: { channel: subscription.channel, enabled: body.enabled },
      });

      return Response.success(
        { ...serializeSubscription(updated), subscriberId: encodeId('subscriber', updated.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    {
      client: true,
      body: t.Composite([t.Object({ enabled: t.Boolean() }), SubscriptionInputSchema]),
    }
  )
  .delete(
    '/client/subscriptions',
    async ({ body, db, tenant, clientEvent }) => {
      const resolved = resolveSubscriptionInput(body);
      const subscription = await findSubscriptionByEndpoint(
        db,
        tenant.id,
        resolved.channel,
        resolved.endpoint
      );

      const deleted = await softDeleteSubscription(db, subscription.id);

      await clientEvent(resolved.endpoint.slice(0, 8))({
        event: 'subscription.removed',
        tenantId: tenant.id,
        target: { type: 'subscription', id: subscription.id },
        data: { channel: subscription.channel, platform: subscription.platform },
      });

      return Response.success(
        { ...serializeSubscription(deleted), subscriberId: encodeId('subscriber', deleted.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    {
      client: true,
      body: SubscriptionInputSchema,
    }
  );
