import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import {
  ExternalIdSchema,
  registerSubscription,
  resolveSubscriptionEventData,
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
    async ({ body, db, set, tenant }) => {
      const resolved = resolveSubscriptionInput(body);

      const { subscription, subscriptionCreated, subscriberCreated, subscriber } = await registerSubscription(
        db,
        tenant.id,
        {
          externalId: body.externalId,
          ...resolved,
        }
      );

      const events: SystemEvent[] = [];

      if (subscriberCreated) {
        events.push({
          name: 'subscriber.created',
          data: { externalId: subscriber.externalId, attributes: subscriberAttributes(subscriber) },
        });
      }

      if (subscriptionCreated) {
        events.push({
          name: 'subscription.registered',
          data: resolveSubscriptionEventData(subscription, subscriber.externalId),
        });
      }

      await recordSystemEvents(tenant.id, subscriber, events);

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
