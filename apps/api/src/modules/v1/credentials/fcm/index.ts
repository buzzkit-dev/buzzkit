import {
  replaceCredential,
  serializeCredential,
  validateFcmUpload,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { parseServiceAccount } from '@buzzkit/api/providers/fcm/index';
import Elysia, { t } from 'elysia';

export const credentialsFcm = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .post(
    '/credentials/fcm',
    async ({ body, db, set, tenant, event }) => {
      const account = parseServiceAccount(body.serviceAccount);
      if (!account) {
        throw new BadRequestError(
          'serviceAccount must be a Firebase service-account JSON with project_id, client_email, and private_key'
        );
      }

      const outcome = await validateFcmUpload(account);

      const credential = await replaceCredential(db, tenant.id, {
        provider: 'fcm',
        environment: 'production',
        secret: account.private_key,
        details: { projectId: account.project_id, clientEmail: account.client_email },
        outcome,
      });

      await event({
        event: 'credential.created',
        tenantId: tenant.id,
        target: { type: 'credential', id: credential.id },
        data: { provider: 'fcm', projectId: account.project_id, status: credential.status },
      });

      return Response.success(serializeCredential(credential), { entity: 'credential' })
        .status(201)
        .send(set);
    },
    {
      tenant: 'credentials:write',
      body: t.Object({
        serviceAccount: t.Union([
          t.String({ minLength: 1, maxLength: 20_000 }),
          t.Record(t.String(), t.Any()),
        ]),
      }),
    }
  );
