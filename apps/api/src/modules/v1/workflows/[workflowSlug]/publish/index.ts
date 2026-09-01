import { serializeWorkflow, transitionWorkflow } from '@buzzkit/api/api/workflows/index';
import { WorkflowSlugParamsSchema } from '@buzzkit/api/api/workflows/schemas';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const workflowPublish = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .post(
    '/workflows/:workflowSlug/publish',
    async ({ audit, db, params, tenant }) => {
      const published = await transitionWorkflow(db, audit, tenant.id, params.workflowSlug, 'publish');
      return Response.success(serializeWorkflow(published, published.current, published.latest), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: WorkflowSlugParamsSchema }
  );
