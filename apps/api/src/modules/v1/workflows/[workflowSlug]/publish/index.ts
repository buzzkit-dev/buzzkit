import { findWorkflowBySlug, publishWorkflow, serializeWorkflow } from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import Elysia, { t } from 'elysia';

export const workflowPublish = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .post(
    '/workflows/:workflowSlug/publish',
    async ({ audit, db, params, tenant }) => {
      const existing = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const published = await publishWorkflow(db, existing);

      await audit({
        event: 'workflow.published',
        tenantId: tenant.id,
        target: { type: 'workflow', id: existing.id },
        data: { slug: existing.slug, version: published.latest.version },
      });

      return Response.success(serializeWorkflow(published, published.current, published.latest), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: t.Object({ workflowSlug: SlugSchema }) }
  );
