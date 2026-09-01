import {
  findSecret,
  SecretNameParamsSchema,
  SecretValueSchema,
  serializeSecret,
  softDeleteSecret,
  upsertSecret,
} from '@buzzkit/api/api/secrets/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const secret = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Secrets'] } })
  .get(
    '/secrets/:name',
    async ({ db, params, tenant }) => {
      const target = await findSecret(db, tenant.id, params.name);
      return Response.success(serializeSecret(target), { entity: 'secret' }).send();
    },
    { tenant: 'secrets:read', params: SecretNameParamsSchema }
  )
  .put(
    '/secrets/:name',
    async ({ db, params, body, tenant, audit, set }) => {
      const { secret: saved, created } = await upsertSecret(db, tenant.id, params.name, body.value);
      await audit({
        event: created ? 'secret.created' : 'secret.updated',
        tenantId: tenant.id,
        target: { type: 'secret', id: saved.id },
        data: { name: saved.name, version: saved.version },
      });
      set.status = created ? 201 : 200;
      return Response.success(serializeSecret(saved), { entity: 'secret' }).send();
    },
    { tenant: 'secrets:write', params: SecretNameParamsSchema, body: SecretValueSchema }
  )
  .delete(
    '/secrets/:name',
    async ({ db, params, tenant, audit }) => {
      const target = await findSecret(db, tenant.id, params.name);
      const deleted = await softDeleteSecret(db, target.id);
      await audit({
        event: 'secret.deleted',
        tenantId: tenant.id,
        target: { type: 'secret', id: target.id },
        data: { name: target.name },
      });
      return Response.success(markDeleted(serializeSecret(deleted)), { entity: 'secret' }).send();
    },
    { tenant: 'secrets:write', params: SecretNameParamsSchema }
  );
