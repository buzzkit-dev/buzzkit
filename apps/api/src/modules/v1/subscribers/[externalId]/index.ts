import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import {
  AttributesSchema,
  assertNoSystemAttributes,
  assertTimezone,
  EmailAddressSchema,
  ExternalIdParamsSchema,
  findSubscriberByExternalId,
  listSubscriptions,
  resolveSubscriptionEventData,
  SubscribeOptionsSchema,
  serializeSubscriber,
  serializeSubscription,
  softDeleteSubscriber,
  upsertSubscriberProfile,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscriber = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers/:externalId',
    async ({ db, params, tenant }) => {
      const target = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const subscriptions = await listSubscriptions(db, target.id);
      return Response.success(
        {
          ...serializeSubscriber(target),
          subscriptions: subscriptions.map(serializeSubscription).map((subscription) => {
            return {
              ...subscription,
              id: encodeId('subscription', subscription.id),
              subscriberId: encodeId('subscriber', subscription.subscriberId),
            };
          }),
        },
        { entity: 'subscriber', ignoreTransform: ['attributes'] }
      ).send();
    },
    { tenant: 'subscribers:read', params: ExternalIdParamsSchema }
  )
  .put(
    '/subscribers/:externalId',
    async ({ body, db, params, set, tenant }) => {
      assertNoSystemAttributes(body?.attributes);
      assertTimezone(body?.timezone);

      const { subscriber: target, created } = await upsertSubscriberProfile(
        db,
        tenant.id,
        params.externalId,
        {
          upsert: {
            attributes: body?.attributes,
            ...(body?.timezone ? { systemAttributes: { $timezone: body.timezone } } : {}),
          },
          email: body?.email,
          subscribe: body?.subscribe,
          events: (outcome) => {
            if (!outcome.created && !outcome.changed) return [];

            return [
              {
                name: outcome.created ? 'subscriber.created' : 'subscriber.updated',
                data: {
                  externalId: outcome.subscriber.externalId,
                  attributes: subscriberAttributes(outcome.subscriber),
                },
              },
            ];
          },
        }
      );

      return Response.success(serializeSubscriber(target), {
        entity: 'subscriber',
        ignoreTransform: ['attributes'],
      })
        .status(created ? 201 : 200)
        .send(set);
    },
    {
      tenant: 'subscribers:write',
      params: ExternalIdParamsSchema,
      body: t.Optional(
        t.Object({
          attributes: t.Optional(AttributesSchema),
          email: t.Optional(EmailAddressSchema),
          subscribe: t.Optional(SubscribeOptionsSchema),
          timezone: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
        })
      ),
    }
  )
  .delete(
    '/subscribers/:externalId',
    async ({ db, params, tenant }) => {
      const target = await findSubscriberByExternalId(db, tenant.id, params.externalId);

      const deleted = await softDeleteSubscriber(db, target);

      await recordSystemEvents(tenant.id, target, [
        ...deleted.subscriptions.map((subscription): SystemEvent => {
          return {
            name: 'subscription.removed',
            data: resolveSubscriptionEventData(subscription, target.externalId),
          };
        }),
        { name: 'subscriber.deleted', data: { externalId: target.externalId } },
      ]);

      return Response.success(markDeleted(serializeSubscriber(deleted.subscriber)), {
        entity: 'subscriber',
        ignoreTransform: ['attributes'],
      }).send();
    },
    { tenant: 'subscribers:write', params: ExternalIdParamsSchema }
  );
