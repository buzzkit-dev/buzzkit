import {
  ExternalIdSchema,
  findSubscriberByExternalId,
  listSubscriptions,
  serializeSubscription,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia, { t } from 'elysia';

export const subscriberSubscriptions = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Subscriptions'] } })
  .get(
    '/subscribers/:externalId/subscriptions',
    async ({ db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const rows = await listSubscriptions(db, subscriber.id);

      return Response.list(
        rows.map(serializeSubscription).map((subscription) => ({
          ...subscription,
          subscriberId: encodeId('subscriber', subscription.subscriberId),
        })),
        { entity: 'subscription' }
      ).send();
    },
    { tenant: 'subscriptions:read', params: t.Object({ externalId: ExternalIdSchema }) }
  );
