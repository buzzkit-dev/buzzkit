import { ExternalIdSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { getPreferences, PreferenceChangesSchema, setPreferences } from '@buzzkit/api/api/topics/index';
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
      const preferences = await getPreferences(db, tenant.id, subscriber.id);

      return Response.success(preferences).send();
    },
    { tenant: 'subscribers:read', params: t.Object({ externalId: ExternalIdSchema }) }
  )
  .patch(
    '/subscribers/:externalId/preferences',
    async ({ body, db, params, tenant, event }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      const preferences = await setPreferences(db, tenant.id, subscriber.id, body.preferences);

      await event({
        event: 'preferences.updated',
        tenantId: tenant.id,
        target: { type: 'subscriber', id: subscriber.id },
        data: { externalId: subscriber.externalId, changes: body.preferences },
      });

      return Response.success(preferences).send();
    },
    {
      tenant: 'subscribers:write',
      params: t.Object({ externalId: ExternalIdSchema }),
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
