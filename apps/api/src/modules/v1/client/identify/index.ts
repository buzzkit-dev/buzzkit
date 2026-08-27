import { assertChannelConnected } from '@buzzkit/api/api/credentials/index';
import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
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
    async ({ body, db, request, set, tenant }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      if (body.email) await assertChannelConnected(db, tenant.id, 'email', 'email');

      const { subscriber, created, changed } = await upsertSubscriber(db, tenant.id, body.externalId, {
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

      const events: SystemEvent[] = [];

      if (created) {
        events.push({
          name: 'subscriber.created',
          data: { externalId: subscriber.externalId, attributes: subscriberAttributes(subscriber) },
        });
      }

      if (created || changed) {
        events.push({ name: 'identify', data: { attributes: subscriberAttributes(subscriber) } });
      }

      if (registered?.subscriptionCreated) {
        events.push({
          name: 'subscription.registered',
          data: resolveSubscriptionEventData(registered.subscription, subscriber.externalId),
        });
      }
      await recordSystemEvents(tenant.id, subscriber, events);

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
