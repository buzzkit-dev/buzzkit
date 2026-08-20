import {
  ExternalIdSchema,
  registerSubscription,
  resolveSubscriptionInput,
  SubscriptionInputSchema,
  serializeSubscription,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscriptions = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscriptions'] } })
  .post(
    '/subscriptions',
    async ({ body, db, set, tenant, event }) => {
      const resolved = resolveSubscriptionInput(body);

      const { subscription, subscriptionCreated, subscriberCreated, subscriber } = await registerSubscription(
        db,
        tenant.id,
        {
          externalId: body.externalId,
          ...resolved,
        }
      );

      if (subscriptionCreated) {
        await event({
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
      tenant: 'subscriptions:write',
      body: t.Composite([t.Object({ externalId: ExternalIdSchema }), SubscriptionInputSchema]),
    }
  );
