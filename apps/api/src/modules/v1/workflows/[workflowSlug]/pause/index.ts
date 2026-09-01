import { serializeWorkflow, transitionWorkflow } from '@buzzkit/api/api/workflows/index';
import { WorkflowSlugParamsSchema } from '@buzzkit/api/api/workflows/schemas';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const workflowPause = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .post(
    '/workflows/:workflowSlug/pause',
    async ({ audit, db, params, tenant }) => {
      const paused = await transitionWorkflow(db, audit, tenant.id, params.workflowSlug, 'pause');
      return Response.success(serializeWorkflow(paused, paused.current, paused.latest), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: WorkflowSlugParamsSchema }
  );
