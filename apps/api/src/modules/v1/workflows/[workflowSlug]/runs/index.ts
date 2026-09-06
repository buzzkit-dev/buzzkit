import { ListWorkflowRunsQuerySchema, listRuns } from '@buzzkit/api/api/runs/index';
import { findWorkflowBySlug } from '@buzzkit/api/api/workflows/index';
import { WorkflowSlugParamsSchema } from '@buzzkit/api/api/workflows/schemas';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import Elysia from 'elysia';

export const workflowRuns = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/workflows/:workflowSlug/runs',
    async ({ db, params, query, tenant }) => {
      const found = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const page = await listRuns(tenant.id, encodeId('workflow', found.id), query);
      return Response.page(page).send();
    },
    {
      tenant: 'workflows:read',
      params: WorkflowSlugParamsSchema,
      query: ListWorkflowRunsQuerySchema,
    }
  );
