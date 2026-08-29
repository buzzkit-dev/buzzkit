import { listRuns, RUN_STATUSES, resolveRunCursor } from '@buzzkit/api/api/runs/index';
import { findWorkflowBySlug } from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion, SlugSchema } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { clampLimit, PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const runs = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/runs',
    async ({ db, query, tenant }) => {
      const workflow = query.workflow ? await findWorkflowBySlug(db, tenant.id, query.workflow) : null;
      const { items, hasMore, nextCursor } = await listRuns(
        tenant.id,
        workflow ? encodeId('workflow', workflow.id) : undefined,
        {
          status: query.status,
          before: resolveRunCursor(query.cursor),
          limit: clampLimit(query.limit),
        }
      );

      return Response.success(items).paginated({ hasMore, nextCursor }).send();
    },
    {
      tenant: 'workflows:read',
      query: t.Object({
        ...PaginationQuerySchema.properties,
        status: t.Optional(literalUnion(RUN_STATUSES)),
        workflow: t.Optional(SlugSchema),
      }),
    }
  );
