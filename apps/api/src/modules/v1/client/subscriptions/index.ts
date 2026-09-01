import {
  ClientIdentitySchema,
  DeviceContextSchema,
  deviceSystemAttributes,
  findSubscriptionOwnedBy,
  PushPermissionSchema,
  recordRegistration,
  registerSubscription,
  resolveSubscriptionInput,
  resolveSystemAttributes,
  SubscriptionInputSchema,
  serializeSubscription,
  softDeleteSubscription,
  updateSubscriptionEnabled,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
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

      const registered = await registerSubscription(db, tenant.id, {
        externalId: body.externalId,
        ...resolved,
        verifiedNow: verified,
        systemAttributes: {
          ...resolveSystemAttributes(request),
          ...deviceSystemAttributes(body.device),
          ...(resolved.platform ? { $platform: resolved.platform } : {}),
          ...(body.pushPermission !== undefined ? { $pushPermission: body.pushPermission } : {}),
        },
        rebind: verified,
      });

      const { subscription, subscriptionCreated, subscriber } = registered;

      await recordRegistration(tenant.id, registered);

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
        ClientIdentitySchema,
        SubscriptionInputSchema,
        t.Object({
          pushPermission: t.Optional(PushPermissionSchema),
          device: t.Optional(DeviceContextSchema),
        }),
      ]),
    }
  )
  .patch(
    '/client/subscriptions/:id',
    async ({ body, db, headers, params, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscription = await findSubscriptionOwnedBy(db, tenant.id, externalId, params.id);
      const owner = { id: subscription.subscriberId, externalId };

      const updated = await updateSubscriptionEnabled(db, tenant.id, subscription, owner, body.enabled);

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
      const owner = { id: subscription.subscriberId, externalId };

      const deleted = await softDeleteSubscription(db, tenant.id, subscription, owner);

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
