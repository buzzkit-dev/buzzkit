import { subscriberTimezone } from '@buzzkit/api/actor/history';
import { findSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import {
  AssumptionSchema,
  findWorkflowBySlug,
  listWorkflowVersions,
  scheduleTriggerOf,
} from '@buzzkit/api/api/workflows/index';
import { WorkflowSlugParamsSchema } from '@buzzkit/api/api/workflows/schemas';
import { dryRun } from '@buzzkit/api/engine/dry-run';
import { auth } from '@buzzkit/api/libs/auth/index';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { Response } from '@buzzkit/api/libs/response';
import { literalUnion } from '@buzzkit/api/libs/schemas';
import { encodeId } from '@buzzkit/api/libs/sqids';
import {
  lintWorkflow,
  SCHEDULE_TRIGGER_NAME,
  SUBSCRIBER_TIMEZONE,
  TRIGGER_SOURCES,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import { EVENT_NAME_PATTERN } from 'buzzkit/expressions';
import Elysia, { t } from 'elysia';

export const workflowTest = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Workflows'] } })
  .post(
    '/workflows/:workflowSlug/test',
    async ({ body, db, params, tenant }) => {
      const found = await findWorkflowBySlug(db, tenant.id, params.workflowSlug);
      const versions = await listWorkflowVersions(db, found.id);
      const version =
        body.version === undefined
          ? (found.current ?? found.latest)
          : versions.find((candidate) => candidate.version === body.version);
      if (!version) {
        throw new BadRequestError(`Workflow '${found.slug}' has no version ${body.version}`, {
          code: 'version_not_found',
          param: 'version',
        });
      }
      const spec = version.spec as WorkflowSpec;

      let subscriber: Awaited<ReturnType<typeof findSubscriberByExternalId>> | null = null;
      if (body.externalId) subscriber = await findSubscriberByExternalId(db, tenant.id, body.externalId);

      const attributes = subscriber
        ? (subscriber.attributes as Record<string, unknown>)
        : (body.attributes ?? {});
      const at = body.at ? new Date(body.at) : new Date();
      if (Number.isNaN(at.getTime())) {
        throw new BadRequestError('`at` must be an ISO 8601 instant', { code: 'invalid_at', param: 'at' });
      }

      const schedule = scheduleTriggerOf(spec);
      let trigger: { name: string; data: Record<string, unknown>; source: string };
      if (schedule) {
        const zone =
          schedule.timezone === SUBSCRIBER_TIMEZONE
            ? subscriberTimezone(attributes, spec.defaultTimezone)
            : schedule.timezone;
        trigger = {
          name: SCHEDULE_TRIGGER_NAME,
          data: { firedAt: at.toISOString(), zone },
          source: 'system',
        };
      } else {
        const expected = 'event' in spec.trigger ? spec.trigger.event : '';
        const name = body.event?.name ?? expected;
        if (name !== expected) {
          throw new BadRequestError(`Workflow '${found.slug}' starts on '${expected}', not '${name}'`, {
            code: 'event_mismatch',
            param: 'event.name',
          });
        }
        trigger = { name, data: body.event?.data ?? {}, source: body.event?.source ?? 'server' };
      }

      const result = await dryRun({
        runId: `test-${found.slug}-${at.getTime()}`,
        tenantId: tenant.id,
        subscriberId: subscriber?.id ?? 0,
        externalId: subscriber?.externalId ?? body.externalId ?? 'test',
        workflowId: encodeId('workflow', found.id),
        workflowSlug: found.slug,
        versionId: encodeId('workflowVersion', version.id),
        spec,
        trigger: { ...trigger, timestamp: at.toISOString(), sequence: 0 },
        attributes,
        assume: body.assume,
      });

      return Response.success(
        {
          version: version.version,
          trigger,
          subscriber: subscriber ? subscriber.externalId : null,
          ...result,
          lint: lintWorkflow(spec),
        },
        { ignoreTransform: ['trigger', 'steps', 'vars', 'lint'] }
      ).send();
    },
    {
      tenant: 'workflows:read',
      params: WorkflowSlugParamsSchema,
      body: t.Object(
        {
          version: t.Optional(t.Integer({ minimum: 1 })),
          externalId: t.Optional(t.String({ minLength: 1, maxLength: 256 })),
          attributes: t.Optional(t.Record(t.String(), t.Unknown())),
          event: t.Optional(
            t.Object(
              {
                name: t.String({ pattern: EVENT_NAME_PATTERN.source }),
                data: t.Optional(t.Record(t.String(), t.Unknown())),
                source: t.Optional(literalUnion(TRIGGER_SOURCES)),
              },
              { additionalProperties: false }
            )
          ),
          at: t.Optional(t.String()),
          assume: t.Optional(t.Record(t.String(), AssumptionSchema)),
        },
        { additionalProperties: false }
      ),
    }
  );
