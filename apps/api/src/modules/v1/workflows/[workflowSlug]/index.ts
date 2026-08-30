import { diffForEvent } from '@buzzkit/api/api/audit/index';
import { countLiveRuns, emptyRunCounts } from '@buzzkit/api/api/runs/index';
import {
  findWorkflowBySlug,
  serializeWorkflow,
  softDeleteWorkflow,
  UpdateWorkflowSchema,
  updateWorkflow,
} from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import Elysia, { t } from 'elysia';

export const workflow = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/workflows/:workflowSlug',
    async ({ db, params, tenant }) => {
      const found = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const id = encodeId('workflow', found.id);
      const counts = await countLiveRuns(tenant.id, id);
      return Response.success(
        serializeWorkflow(found, found.current, found.latest, {
          versions: found.versions,
          runs: counts.get(id) ?? emptyRunCounts(),
        }),
        { ignoreTransform: ['spec', 'trigger', 'runs'] }
      ).send();
    },
    { tenant: 'workflows:read', params: t.Object({ workflowSlug: SlugSchema }) }
  )
  .patch(
    '/workflows/:workflowSlug',
    async ({ audit, body, db, params, tenant }) => {
      if (Object.keys(body).length === 0) throw new BadRequestError('Nothing to update');
      const existing = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const updated = await updateWorkflow(db, existing, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.spec !== undefined ? { spec: body.spec as WorkflowSpec } : {}),
      });

      const { changes, previousAttributes } = diffForEvent(
        { name: existing.name, description: existing.description, version: existing.latest.version },
        { name: updated.name, description: updated.description, version: updated.latest.version }
      );
      if (changes.length > 0) {
        await audit({
          event: 'workflow.updated',
          tenantId: tenant.id,
          target: { type: 'workflow', id: existing.id },
          data: { slug: existing.slug, changes, previousAttributes },
        });
      }

      return Response.success(serializeWorkflow(updated, updated.current, updated.latest), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: t.Object({ workflowSlug: SlugSchema }), body: UpdateWorkflowSchema }
  )
  .delete(
    '/workflows/:workflowSlug',
    async ({ audit, db, params, tenant }) => {
      const existing = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const deleted = await softDeleteWorkflow(db, existing);

      await audit({
        event: 'workflow.deleted',
        tenantId: tenant.id,
        target: { type: 'workflow', id: existing.id },
        data: { slug: existing.slug },
      });

      return Response.success(markDeleted(serializeWorkflow(deleted, existing.current, existing.latest)), {
        ignoreTransform: ['spec', 'trigger'],
      }).send();
    },
    { tenant: 'workflows:write', params: t.Object({ workflowSlug: SlugSchema }) }
  );
