import {
  CredentialUploadSchema,
  listCredentials,
  replaceCredential,
  resolveCredentialUpload,
  serializeCredential,
  validateCredentialUpload,
} from '@buzzkit/api/api/credentials/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const credentials = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Credentials'] } })
  .get(
    '/credentials',
    async ({ db, tenant }) => {
      const rows = await listCredentials(db, tenant.id);

      return Response.list(rows, { entity: 'credential' }).send();
    },
    { tenant: 'credentials:read' }
  )
  .post(
    '/credentials',
    async ({ body, db, set, tenant, event }) => {
      const upload = resolveCredentialUpload(body);
      const outcome = await validateCredentialUpload(upload.provider, upload);

      const credential = await replaceCredential(db, tenant.id, { ...upload, outcome });

      await event({
        event: 'credential.created',
        tenantId: tenant.id,
        target: { type: 'credential', id: credential.id },
        data: {
          provider: upload.provider,
          channel: credential.channel,
          environment: upload.environment,
          ...upload.details,
          status: credential.status,
        },
      });

      return Response.success(serializeCredential(credential), { entity: 'credential' })
        .status(201)
        .send(set);
    },
    { tenant: 'credentials:write', body: CredentialUploadSchema }
  );
