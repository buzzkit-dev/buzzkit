import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import { ExternalIdSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { listPreferences, PreferenceChangesSchema, updatePreferences } from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const subscriberPreferences = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Preferences'] } })
  .get(
    '/subscribers/:externalId/preferences',
    async ({ db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const preferences = await listPreferences(db, tenant.id, subscriber.id);

      return Response.list(preferences).send();
    },
    { tenant: 'subscribers:read', params: t.Object({ externalId: ExternalIdSchema }) }
  )
  .patch(
    '/subscribers/:externalId/preferences',
    async ({ body, db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const preferences = await updatePreferences(db, tenant.id, subscriber.id, body.preferences);

      await recordSystemEvents(tenant.id, subscriber, [
        { name: 'preferences.updated', data: { changes: body.preferences } },
      ]);

      return Response.list(preferences).send();
    },
    {
      tenant: 'subscribers:write',
      params: t.Object({ externalId: ExternalIdSchema }),
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
