import {
  CredentialUploadSchema,
  listCredentials,
  replaceCredentials,
  resolveCredentialUpload,
  serializeCredential,
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
    async ({ body, db, set, tenant, audit }) => {
      const upload = resolveCredentialUpload(body);
      const created = await replaceCredentials(db, tenant.id, upload);

      for (const credential of created) {
        await audit({
          event: 'credential.created',
          tenantId: tenant.id,
          target: { type: 'credential', id: credential.id },
          data: {
            provider: upload.provider,
            channel: credential.channel,
            environment: credential.environment,
            ...upload.details,
            status: credential.status,
          },
        });
      }

      return Response.list(created.map(serializeCredential), { entity: 'credential' }).status(201).send(set);
    },
    { tenant: 'credentials:write', body: CredentialUploadSchema }
  );
