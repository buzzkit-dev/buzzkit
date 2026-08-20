import {
  replaceCredential,
  serializeCredential,
  validateCredentialUpload,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const credentialsApns = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .post(
    '/credentials/apns',
    async ({ body, db, set, tenant, event }) => {
      const environment = body.environment ?? 'production';

      const details = { teamId: body.teamId, keyId: body.keyId, bundleId: body.bundleId };
      const outcome = await validateCredentialUpload('apns', { secret: body.p8, details, environment });

      const credential = await replaceCredential(db, tenant.id, {
        provider: 'apns',
        environment,
        secret: body.p8,
        details,
        outcome,
      });

      await event({
        event: 'credential.created',
        tenantId: tenant.id,
        target: { type: 'credential', id: credential.id },
        data: { provider: 'apns', environment, bundleId: body.bundleId, status: credential.status },
      });

      return Response.success(serializeCredential(credential), { entity: 'credential' })
        .status(201)
        .send(set);
    },
    {
      tenant: 'credentials:write',
      body: t.Object({
        p8: t.String({ minLength: 1, maxLength: 10_000 }),
        teamId: t.String({ minLength: 10, maxLength: 10 }),
        keyId: t.String({ minLength: 10, maxLength: 10 }),
        bundleId: t.String({ minLength: 1, maxLength: 255 }),
        environment: t.Optional(t.Union([t.Literal('production'), t.Literal('sandbox')])),
      }),
    }
  );
