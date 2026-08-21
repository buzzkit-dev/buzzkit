import { findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { listPreferences, PreferenceChangesSchema, updatePreferences } from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { verifyClientIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const clientPreferences = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .get(
    '/client/preferences',
    async ({ db, headers, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);

      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);
      const preferences = await listPreferences(db, tenant.id, subscriber.id);

      return Response.list(preferences).send();
    },
    { client: true }
  )
  .patch(
    '/client/preferences',
    async ({ body, db, headers, tenant, clientEvent }) => {
      const externalId = await verifyClientIdentity(tenant, headers);

      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);
      const preferences = await updatePreferences(db, tenant.id, subscriber.id, body.preferences);

      await clientEvent(externalId)({
        event: 'preferences.updated',
        tenantId: tenant.id,
        target: { type: 'subscriber', id: subscriber.id },
        data: { externalId, changes: body.preferences },
      });

      return Response.list(preferences).send();
    },
    {
      client: true,
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
