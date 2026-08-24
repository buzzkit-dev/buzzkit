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
    async ({ body, db, request, set, tenant, clientEvent }) => {
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

      if (subscriptionCreated) {
        await clientEvent(subscriber.externalId)({
          event: 'subscription.created',
          tenantId: tenant.id,
          target: { type: 'subscription', id: subscription.id },
          data: { ...resolveSubscriptionEventData(subscription, subscriber.externalId), subscriberCreated },
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
      body: t.Composite([ClientIdentitySchema, SubscriptionInputSchema]),
    }
  )
  .patch(
    '/client/subscriptions/:id',
    async ({ body, db, headers, params, tenant, clientEvent }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscription = await findSubscriptionOwnedBy(db, tenant.id, externalId, params.id);

      const updated = await updateSubscriptionEnabled(db, subscription.id, body.enabled);

      await clientEvent(externalId)({
        event: 'subscription.updated',
        tenantId: tenant.id,
        target: { type: 'subscription', id: subscription.id },
        data: { ...resolveSubscriptionEventData(subscription, externalId), enabled: body.enabled },
      });

      return Response.success(
        { ...serializeSubscription(updated), subscriberId: encodeId('subscriber', updated.subscriberId) },
        { entity: 'subscription' }
      ).send();
    },
    { client: true, body: t.Object({ enabled: t.Boolean() }) }
  )
  .delete(
    '/client/subscriptions/:id',
    async ({ db, headers, params, tenant, clientEvent }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscription = await findSubscriptionOwnedBy(db, tenant.id, externalId, params.id);

      const deleted = await softDeleteSubscription(db, subscription.id);

      await clientEvent(externalId)({
        event: 'subscription.removed',
        tenantId: tenant.id,
        target: { type: 'subscription', id: subscription.id },
        data: resolveSubscriptionEventData(subscription, externalId),
      });

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
