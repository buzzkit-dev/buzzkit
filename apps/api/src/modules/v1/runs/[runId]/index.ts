import { findRun } from '@buzzkit/api/api/runs/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const run = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/runs/:runId',
    async ({ db, params, tenant }) => {
      const found = await findRun(db, tenant.id, params.runId);
      return Response.success(found, { ignoreTransform: ['data'] }).send();
    },
    { tenant: 'workflows:read', params: t.Object({ runId: t.String({ maxLength: 200 }) }) }
  );
