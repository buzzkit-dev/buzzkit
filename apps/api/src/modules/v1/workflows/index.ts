import { countLiveRuns, emptyRunCounts } from '@buzzkit/api/api/runs/index';
import {
  CreateWorkflowSchema,
  createWorkflow,
  listWorkflows,
  serializeWorkflow,
} from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { Response } from '@buzzkit/api/libs/response';
import { encodeId } from '@buzzkit/api/libs/sqids';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import Elysia from 'elysia';

export const workflows = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/workflows',
    async ({ db, tenant }) => {
      const [rows, counts] = await Promise.all([listWorkflows(db, tenant.id), countLiveRuns(tenant.id)]);
      return Response.list(
        rows.map((row) =>
          serializeWorkflow(row, row.current, row.latest, {
            runs: counts.get(encodeId('workflow', row.id)) ?? emptyRunCounts(),
          })
        ),
        { ignoreTransform: ['spec', 'trigger', 'runs'] }
      ).send();
    },
    { tenant: 'workflows:read' }
  )
  .post(
    '/workflows',
    async ({ audit, body, db, set, tenant }) => {
      const workflow = await createWorkflow(db, tenant.id, { ...body, spec: body.spec as WorkflowSpec });

      await audit({
        event: 'workflow.created',
        tenantId: tenant.id,
        target: { type: 'workflow', id: workflow.id },
        data: { slug: workflow.slug, name: workflow.name },
      });

      return Response.success(serializeWorkflow(workflow, workflow.current, workflow.latest), {
        ignoreTransform: ['spec', 'trigger'],
      })
        .status(201)
        .send(set);
    },
    { tenant: 'workflows:write', body: CreateWorkflowSchema }
  );
