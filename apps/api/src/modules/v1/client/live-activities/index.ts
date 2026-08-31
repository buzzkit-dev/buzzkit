import {
  endLiveActivityByClient,
  RegisterLiveActivitySchema,
  registerLiveActivity,
  serializeLiveActivity,
} from '@buzzkit/api/api/live-activities/index';
import {
  ClientIdentitySchema,
  findSubscriberByExternalId,
  resolveSystemAttributes,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyClientIdentity, verifyIdentity } from '@buzzkit/api/libs/identity';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const clientLiveActivities = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/live-activities',
    async ({ body, db, request, set, tenant }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      const { subscriber } = await upsertSubscriber(db, tenant.id, body.externalId, {
        verifiedNow: verified,
        systemAttributes: resolveSystemAttributes(request),
      });

      const { activity, created } = await registerLiveActivity(db, tenant.id, subscriber, body);

      return Response.success(serializeLiveActivity(activity), { entity: 'liveActivity' })
        .status(created ? 201 : 200)
        .send(set);
    },
    {
      client: true,
      body: t.Composite([ClientIdentitySchema, RegisterLiveActivitySchema]),
    }
  )
  .delete(
    '/client/live-activities/:id',
    async ({ db, headers, params, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);

      const activity = await endLiveActivityByClient(db, tenant.id, subscriber.id, params.id);

      return Response.success(markDeleted(serializeLiveActivity(activity)), {
        entity: 'liveActivity',
      }).send();
    },
    { client: true }
  );
