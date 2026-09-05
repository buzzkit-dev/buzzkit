import { type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import {
  AttributesSchema,
  assertNoSystemAttributes,
  ClientIdentitySchema,
  DeviceContextSchema,
  deviceSystemAttributes,
  EmailAddressSchema,
  PushPermissionSchema,
  resolveSystemAttributes,
  SubscribeOptionsSchema,
  serializeSubscriber,
  upsertSubscriberProfile,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
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

      assertNoSystemAttributes(body.attributes);

      const { subscriber, created } = await upsertSubscriberProfile(db, tenant.id, body.externalId, {
        upsert: {
          ...(body.attributes !== undefined ? { attributes: body.attributes, mergeAttributes: true } : {}),
          verifiedNow: verified,
          systemAttributes: {
            ...resolveSystemAttributes(request),
            ...deviceSystemAttributes(body.device),
            ...(body.pushPermission !== undefined ? { $pushPermission: body.pushPermission } : {}),
          },
        },
        email: body.email,
        subscribe: body.subscribe,
        rebind: verified,
        events: (outcome) => {
          const events: SystemEvent[] = [];

          if (outcome.created) {
            events.push({
              name: 'subscriber.created',
              data: {
                externalId: outcome.subscriber.externalId,
                attributes: subscriberAttributes(outcome.subscriber),
              },
            });
          }

          if (outcome.created || outcome.changed) {
            events.push({ name: 'identify', data: { attributes: subscriberAttributes(outcome.subscriber) } });
          }

          return events;
        },
      });

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
      body: t.Composite([
        ClientIdentitySchema,
        t.Object({
          email: t.Optional(EmailAddressSchema),
          subscribe: t.Optional(SubscribeOptionsSchema),
          attributes: t.Optional(AttributesSchema),
          pushPermission: t.Optional(PushPermissionSchema),
          device: t.Optional(DeviceContextSchema),
        }),
      ]),
    }
  );
