import {
  AttributesSchema,
  EmailAddressSchema,
  ExternalIdSchema,
  findSubscriberByExternalId,
  listSubscriptions,
  registerSubscription,
  serializeSubscriber,
  serializeSubscription,
  softDeleteSubscriber,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

const withSubscriberId = <T extends { id: number }>(item: T) => ({
  ...item,
  id: encodeId('subscriber', item.id),
});

export const subscriber = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscribers'] } })
  .put(
    '/subscribers/:externalId',
    async ({ body, db, params, set, tenant, event }) => {
      const { subscriber, created } = await upsertSubscriber(db, tenant.id, params.externalId, {
        attributes: body?.attributes,
      });

      if (body?.email) {
        await registerSubscription(db, tenant.id, {
          externalId: subscriber.externalId,
          channel: 'email',
          platform: null,
          endpoint: body.email,
        });
      }

      await event({
        event: created ? 'subscriber.created' : 'subscriber.updated',
        tenantId: tenant.id,
        target: { type: 'subscriber', id: subscriber.id },
        data: { externalId: subscriber.externalId },
      });

      return Response.success(withSubscriberId(serializeSubscriber(subscriber)), {
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
  .get(
    '/subscribers/:externalId',
    async ({ db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const subscriptions = await listSubscriptions(db, subscriber.id);

      return Response.success(
        {
          ...withSubscriberId(serializeSubscriber(subscriber)),
          subscriptions: subscriptions.map(serializeSubscription).map((subscription) => ({
            ...subscription,
            id: encodeId('subscription', subscription.id),
            subscriberId: encodeId('subscriber', subscription.subscriberId),
          })),
        },
        { ignoreTransform: ['attributes'] }
      ).send();
    },
    { tenant: 'subscribers:read', params: t.Object({ externalId: ExternalIdSchema }) }
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

      return Response.success(withSubscriberId(serializeSubscriber(deleted)), {
        ignoreTransform: ['attributes'],
      }).send();
    },
    { tenant: 'subscribers:write', params: t.Object({ externalId: ExternalIdSchema }) }
  );
