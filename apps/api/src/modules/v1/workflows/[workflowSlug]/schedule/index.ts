import {
  findWorkflowBySlug,
  listFires,
  nextFires,
  scheduleTriggerOf,
} from '@buzzkit/api/api/workflows/index';
import { auth } from '@buzzkit/api/libs/auth';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { SlugSchema } from '@buzzkit/api/libs/schemas';
import { DEFAULT_TIMEZONE, type WorkflowSpec } from '@buzzkit/schema/workflows';
import Elysia, { t } from 'elysia';

export const workflowSchedule = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .get(
    '/workflows/:workflowSlug/schedule',
    async ({ db, params, tenant }) => {
      const found = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const version = found.current ?? found.latest;
      const trigger = scheduleTriggerOf(version.spec as WorkflowSpec);
      if (!trigger) {
        throw new BadRequestError(`Workflow '${found.slug}' starts on an event, not a schedule`, {
          code: 'not_scheduled',
          param: 'workflowSlug',
        });
      }
      const now = new Date();
      const fires = await listFires(db, found.id);
      return Response.success({
        schedule: trigger.schedule,
        timezone: trigger.timezone,
        defaultTimezone: (version.spec as WorkflowSpec).defaultTimezone ?? DEFAULT_TIMEZONE,
        segment: trigger.segment ?? null,
        next:
          found.status === 'active'
            ? nextFires(trigger, now).map((fire) => ({ zone: fire.zone, at: fire.at.toISOString() }))
            : [],
        fires: fires.map((fire) => ({
          firedAt: fire.fireAt.toISOString(),
          zones: (typeof fire.zones === 'string' ? JSON.parse(fire.zones) : fire.zones) as string[],
          version: fire.version,
          started: fire.started,
          finishedAt: fire.finishedAt ? new Date(fire.finishedAt).toISOString() : null,
        })),
      }).send();
    },
    { tenant: 'workflows:read', params: t.Object({ workflowSlug: SlugSchema }) }
  );
