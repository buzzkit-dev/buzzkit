import {
  EmailAddressSchema,
  ExternalIdSchema,
  registerSubscription,
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
    async ({ body, db, set, tenant, clientEvent }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      const { subscriber, created } = await upsertSubscriber(db, tenant.id, body.externalId, {
        verifiedNow: verified,
      });

      if (body.email) {
        await registerSubscription(db, tenant.id, {
          subscriber,
          externalId: subscriber.externalId,
          channel: 'email',
          platform: null,
          endpoint: body.email,
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
      body: t.Object({
        externalId: ExternalIdSchema,
        email: t.Optional(EmailAddressSchema),
        identityHash: t.Optional(t.String({ maxLength: 128 })),
      }),
    }
  );
