import { listRuns, RUN_STATUSES } from '@buzzkit/api/api/runs/index';
import { findWorkflowBySlug } from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion, SlugSchema } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { PaginationQuerySchema } from '@buzzkit/api/utils/pagination';
import Elysia, { t } from 'elysia';

export const runs = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/runs',
    async ({ db, query, tenant }) => {
      let workflow: Awaited<ReturnType<typeof findWorkflowBySlug>> | null = null;
      if (query.workflow) workflow = await findWorkflowBySlug(db, tenant.id, query.workflow);

      const page = await listRuns(tenant.id, workflow ? encodeId('workflow', workflow.id) : undefined, query);

      return Response.page(page).send();
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
