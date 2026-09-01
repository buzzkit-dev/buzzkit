import { ExternalIdParamsSchema } from '@buzzkit/api/api/subscribers/index';
import {
  listSubscriberPreferences,
  PreferenceChangesSchema,
  updateSubscriberPreferences,
} from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const subscriberPreferences = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Preferences'] } })
  .get(
    '/subscribers/:externalId/preferences',
    async ({ db, params, tenant }) => {
      const preferences = await listSubscriberPreferences(db, tenant.id, params.externalId);
      return Response.list(preferences).send();
    },
    { tenant: 'subscribers:read', params: ExternalIdParamsSchema }
  )
  .patch(
    '/subscribers/:externalId/preferences',
    async ({ body, db, params, tenant }) => {
      const preferences = await updateSubscriberPreferences(
        db,
        tenant.id,
        params.externalId,
        body.preferences
      );
      return Response.list(preferences).send();
    },
    {
      tenant: 'subscribers:write',
      params: ExternalIdParamsSchema,
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
