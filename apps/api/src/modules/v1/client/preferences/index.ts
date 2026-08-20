import { findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { getPreferences, PreferenceChangesSchema, setPreferences } from '@buzzkit/api/api/topics/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { verifyIdentity } from '@buzzkit/api/libs/identity';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

const subscriberHeaders = (headers: Record<string, string | undefined>) => {
  const externalId = headers['buzzkit-subscriber'];
  if (!externalId) {
    throw new BadRequestError('Missing buzzkit-subscriber header');
  }
  return { externalId, identityHash: headers['buzzkit-identity'] };
};

export const clientPreferences = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .get(
    '/client/preferences',
    async ({ db, headers, tenant }) => {
      const { externalId, identityHash } = subscriberHeaders(headers);
      await verifyIdentity(tenant, externalId, identityHash);

      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);
      const preferences = await getPreferences(db, tenant.id, subscriber.id);

      return Response.success(preferences).send();
    },
    { client: true }
  )
  .patch(
    '/client/preferences',
    async ({ body, db, headers, tenant, clientEvent }) => {
      const { externalId, identityHash } = subscriberHeaders(headers);
      await verifyIdentity(tenant, externalId, identityHash);

      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);
      const preferences = await setPreferences(db, tenant.id, subscriber.id, body.preferences);

      await clientEvent(externalId)({
        event: 'preferences.updated',
        tenantId: tenant.id,
        target: { type: 'subscriber', id: subscriber.id },
        data: { externalId, changes: body.preferences },
      });

      return Response.success(preferences).send();
    },
    {
      client: true,
      body: t.Object({
        preferences: PreferenceChangesSchema,
      }),
    }
  );
