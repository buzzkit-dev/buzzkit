import {
  AttributesSchema,
  assertNoSystemAttributes,
  EmailAddressSchema,
  ExternalIdSchema,
  findSubscriberByExternalId,
  listSubscriptions,
  registerSubscription,
  resolveSubscriptionEventData,
  serializeSubscriber,
  serializeSubscription,
  softDeleteSubscriber,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscriber = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .get(
    '/subscribers/:externalId',
    async ({ db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const subscriptions = await listSubscriptions(db, subscriber.id);

      return Response.success(
        {
          ...serializeSubscriber(subscriber),
          subscriptions: subscriptions.map(serializeSubscription).map((subscription) => ({
            ...subscription,
            id: encodeId('subscription', subscription.id),
            subscriberId: encodeId('subscriber', subscription.subscriberId),
          })),
        },
        { entity: 'subscriber', ignoreTransform: ['attributes'] }
      ).send();
    },
    { tenant: 'subscribers:read', params: t.Object({ externalId: ExternalIdSchema }) }
  )
  .put(
    '/subscribers/:externalId',
    async ({ body, db, params, set, tenant, event }) => {
      assertNoSystemAttributes(body?.attributes);

      const { subscriber, created, changed } = await upsertSubscriber(db, tenant.id, params.externalId, {
        attributes: body?.attributes,
      });

      const registered = body?.email
        ? await registerSubscription(db, tenant.id, {
            subscriber,
            externalId: subscriber.externalId,
            channel: 'email',
            platform: null,
            endpoint: body.email,
          })
        : null;

      if (registered?.subscriptionCreated) {
        await event({
          event: 'subscription.created',
          tenantId: tenant.id,
          target: { type: 'subscription', id: registered.subscription.id },
          data: {
            ...resolveSubscriptionEventData(registered.subscription, subscriber.externalId),
            subscriberCreated: created,
          },
        });
      }

      if (created || changed) {
        await event({
          event: created ? 'subscriber.created' : 'subscriber.updated',
          tenantId: tenant.id,
          target: { type: 'subscriber', id: subscriber.id },
          data: { externalId: subscriber.externalId },
        });
      }

      return Response.success(serializeSubscriber(subscriber), {
        entity: 'subscriber',
        ignoreTransform: ['attributes'],
      })
        .status(created ? 201 : 200)
        .send(set);
    },
    {
      tenant: 'subscribers:write',
      params: t.Object({ externalId: ExternalIdSchema }),
      body: t.Optional(
        t.Object({
          attributes: t.Optional(AttributesSchema),
          email: t.Optional(EmailAddressSchema),
        })
      ),
    }
  )
  .delete(
    '/subscribers/:externalId',
    async ({ db, params, tenant, event }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);

      const deleted = await softDeleteSubscriber(db, subscriber);

      await event({
        event: 'subscriber.deleted',
        tenantId: tenant.id,
        target: { type: 'subscriber', id: subscriber.id },
        data: { externalId: subscriber.externalId },
      });

      return Response.success(markDeleted(serializeSubscriber(deleted)), {
        entity: 'subscriber',
        ignoreTransform: ['attributes'],
      }).send();
    },
    { tenant: 'subscribers:write', params: t.Object({ externalId: ExternalIdSchema }) }
  );
