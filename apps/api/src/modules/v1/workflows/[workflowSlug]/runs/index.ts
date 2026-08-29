import { listRuns, RUN_STATUSES, resolveRunCursor } from '@buzzkit/api/api/runs/index';
import { findWorkflowBySlug } from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion, SlugSchema } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const workflowRuns = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/workflows/:workflowSlug/runs',
    async ({ db, params, query, tenant }) => {
      const found = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const { items, hasMore, nextCursor } = await listRuns(tenant.id, encodeId('workflow', found.id), {
        status: query.status,
        before: resolveRunCursor(query.cursor),
        limit: clampLimit(query.limit),
      });

      return Response.success(items).paginated({ hasMore, nextCursor }).send();
    },
    {
      tenant: 'workflows:read',
      params: t.Object({ workflowSlug: SlugSchema }),
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(literalUnion(RUN_STATUSES)),
      }),
    }
  );
