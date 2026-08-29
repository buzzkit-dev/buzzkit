import { findWorkflowBySlug, pauseWorkflow, serializeWorkflow } from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const workflowPause = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .post(
    '/workflows/:workflowSlug/pause',
    async ({ audit, db, params, tenant }) => {
      const existing = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const paused = await pauseWorkflow(db, existing);

      await audit({
        event: 'workflow.paused',
        tenantId: tenant.id,
        target: { type: 'workflow', id: existing.id },
        data: { slug: existing.slug },
      });

      return Response.success(serializeWorkflow(paused, paused.current, paused.latest), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: t.Object({ workflowSlug: SlugSchema }) }
  );
