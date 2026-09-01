import {
  listSubscriberPreferences,
  PreferenceChangesSchema,
  updateSubscriberPreferences,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth/index';
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
      const preferences = await listSubscriberPreferences(db, tenant.id, externalId);
      return Response.list(preferences).send();
    },
    { client: true }
  )
  .patch(
    '/client/preferences',
    async ({ body, db, headers, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const preferences = await updateSubscriberPreferences(db, tenant.id, externalId, body.preferences);
      return Response.list(preferences).send();
    },
    {
      client: true,
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
