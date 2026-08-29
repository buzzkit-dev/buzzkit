import { listSubscriberRuns } from '@buzzkit/api/api/runs/index';
import { ExternalIdSchema, findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const subscriberRuns = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/subscribers/:externalId/runs',
    async ({ db, params, tenant }) => {
      const subscriber = await findSubscriberByExternalId(db, tenant.id, params.externalId);
      return Response.list(await listSubscriberRuns(tenant.id, subscriber)).send();
    },
    { tenant: 'workflows:read', params: t.Object({ externalId: ExternalIdSchema }) }
  );
