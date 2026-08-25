import { assertChannelConnected } from '@buzzkit/api/api/credentials/index';
import {
  ClientIdentitySchema,
  EmailAddressSchema,
  registerSubscription,
  resolveSubscriptionEventData,
  resolveSystemAttributes,
  serializeSubscriber,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const clientIdentify = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/identify',
    async ({ body, db, request, set, tenant, clientEvent }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      if (body.email) await assertChannelConnected(db, tenant.id, 'email', 'email');

      const { subscriber, created } = await upsertSubscriber(db, tenant.id, body.externalId, {
        verifiedNow: verified,
        systemAttributes: resolveSystemAttributes(request),
      });

      const registered = body.email
        ? await registerSubscription(db, tenant.id, {
            subscriber,
            externalId: subscriber.externalId,
            channel: 'email',
            platform: null,
            endpoint: body.email,
            rebind: verified,
          })
        : null;

      if (registered?.subscriptionCreated) {
        await clientEvent(subscriber.externalId)({
          event: 'subscription.created',
          tenantId: tenant.id,
          target: { type: 'subscription', id: registered.subscription.id },
          data: {
            ...resolveSubscriptionEventData(registered.subscription, subscriber.externalId),
            subscriberCreated: created,
          },
        });
      }

      if (created) {
        await clientEvent(subscriber.externalId)({
          event: 'subscriber.created',
          tenantId: tenant.id,
          target: { type: 'subscriber', id: subscriber.id },
          data: { externalId: subscriber.externalId },
        });
      }

      return Response.success(
        {
          ...serializeSubscriber(subscriber),
          id: encodeId('subscriber', subscriber.id),
        },
        { ignoreTransform: ['attributes'] }
      )
        .status(created ? 201 : 200)
        .send(set);
    },
    {
      client: true,
      body: t.Composite([ClientIdentitySchema, t.Object({ email: t.Optional(EmailAddressSchema) })]),
    }
  );
