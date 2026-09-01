import { listRuns, RUN_STATUSES } from '@buzzkit/api/api/runs/index';
import { findWorkflowBySlug } from '@buzzkit/api/api/workflows/index';
import { WorkflowSlugParamsSchema } from '@buzzkit/api/api/workflows/schemas';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

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
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(literalUnion(RUN_STATUSES)),
      }),
    }
  );
