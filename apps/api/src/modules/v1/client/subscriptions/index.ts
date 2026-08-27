import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import {
  ClientIdentitySchema,
  findSubscriptionOwnedBy,
  registerSubscription,
  resolveSubscriptionEventData,
  resolveSubscriptionInput,
  resolveSystemAttributes,
  SubscriptionInputSchema,
  serializeSubscription,
  softDeleteSubscription,
  updateSubscriptionEnabled,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyClientIdentity, verifyIdentity } from '@buzzkit/api/libs/identity';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const clientSubscriptions = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/subscriptions',
    async ({ body, db, request, set, tenant }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);
      const resolved = resolveSubscriptionInput(body);

      const { subscription, subscriptionCreated, subscriberCreated, subscriber } = await registerSubscription(
        db,
        tenant.id,
        {
          externalId: body.externalId,
          ...resolved,
          verifiedNow: verified,
          systemAttributes: resolveSystemAttributes(request),
          rebind: verified,
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
      client: true,
      body: t.Composite([ClientIdentitySchema, SubscriptionInputSchema]),
    }
  )
  .patch(
    '/client/subscriptions/:id',
    async ({ body, db, headers, params, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscription = await findSubscriptionOwnedBy(db, tenant.id, externalId, params.id);

      const updated = await updateSubscriptionEnabled(db, subscription.id, body.enabled);

      await recordSystemEvents(tenant.id, { id: subscription.subscriberId, externalId }, [
        {
          name: body.enabled ? 'subscription.unmuted' : 'subscription.muted',
          data: resolveSubscriptionEventData(subscription, externalId),
        },
      ]);

      return Response.success(
        { ...serializeSubscription(updated), subscriberId: encodeId('subscriber', updated.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    { client: true, body: t.Object({ enabled: t.Boolean() }) }
  )
  .delete(
    '/client/subscriptions/:id',
    async ({ db, headers, params, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscription = await findSubscriptionOwnedBy(db, tenant.id, externalId, params.id);

      const deleted = await softDeleteSubscription(db, subscription.id);

      await recordSystemEvents(tenant.id, { id: subscription.subscriberId, externalId }, [
        { name: 'subscription.removed', data: resolveSubscriptionEventData(subscription, externalId) },
      ]);

      return Response.success(
        markDeleted({
          ...serializeSubscription(deleted),
          subscriberId: encodeId('subscriber', deleted.subscriberId),
        }),
        { entity: 'subscription' }
      ).send();
    },
    { client: true }
  );
