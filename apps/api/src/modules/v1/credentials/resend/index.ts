import {
  replaceCredential,
  serializeCredential,
  validateCredentialUpload,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const credentialsResend = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .post(
    '/credentials/resend',
    async ({ body, db, set, tenant, event }) => {
      const outcome = await validateCredentialUpload('resend', {
        secret: body.apiKey,
        details: {},
        environment: 'production',
      });

      const credential = await replaceCredential(db, tenant.id, {
        provider: 'resend',
        environment: 'production',
        secret: body.apiKey,
        details: {},
        outcome,
      });

      await event({
        event: 'credential.created',
        tenantId: tenant.id,
        target: { type: 'credential', id: credential.id },
        data: { provider: 'resend', channel: 'email', status: credential.status },
      });

      return Response.success(serializeCredential(credential), { entity: 'credential' })
        .status(201)
        .send(set);
    },
    {
      tenant: 'credentials:write',
      body: t.Object({
        apiKey: t.String({ minLength: 1, maxLength: 256 }),
      }),
    }
  );
