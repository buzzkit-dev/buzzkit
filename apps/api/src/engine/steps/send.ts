import { createMessage, enqueueFanout } from '@buzzkit/api/api/messages/index';
import { policyTimezone, shiftOutOfQuietHours } from '@buzzkit/api/api/messages/policy';
import { resolveTenantSettings } from '@buzzkit/api/api/tenants/index';
import { findTopicBySlug } from '@buzzkit/api/api/topics/index';
import { createDb } from '@buzzkit/api/libs/database';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { wallClock } from '@buzzkit/api/libs/timezone';
import { and, type Db, eq, gte, like, or, sql, tables } from '@buzzkit/database';
import {
  describeDuration,
  durationSeconds,
  type SendStep,
  type WaitUntilStep,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';
import { describeInstant } from '../moments';
import { renderTemplate, renderValue } from '../template';
import { loadTenant } from '../tenant';

async function sentRecently(db: Db, context: RunContext, current: SendStep, from: Date): Promise<boolean> {
  const { tenantId, subscriberId, workflowId } = context.params;
  const { message, delivery } = tables;
  const reached = or(
    sql`exists (select 1 from ${delivery} where ${delivery.messageId} = ${message.id} and ${delivery.subscriberId} = ${subscriberId})`,
    like(message.runId, `${tenantId}-%-${subscriberId}-%`)
  );
  const same = current.send.topic
    ? eq(message.topic, current.send.topic)
    : and(
        eq(message.runStep, current.name),
        like(message.runId, `${tenantId}-${workflowId}-${subscriberId}-%`)
      );
  const rows = await db
    .select({ id: message.id })
    .from(message)
    .where(and(eq(message.tenantId, tenantId), gte(message.createdAt, from), same, reached))
    .limit(1);
  return rows.length > 0;
}

function unconditionalCancelEvents(spec: WorkflowSpec): string[] {
  return (spec.cancelOn ?? []).filter((rule) => !rule.where).map((rule) => rule.event);
}

export async function runLocalWindow(
  context: RunContext,
  waitStep: WaitUntilStep,
  sendStep: SendStep
): Promise<void> {
  const { name, waitUntil } = waitStep;
  const target = await context.do(`${name}:resolve`, async () => {
    const moment = context.moment(waitUntil);
    const momentZone = moment.timezone ?? context.timezone();
    if (sendStep.send.policy === 'ignore') return { at: moment.at, timezone: momentZone };
    const db = createDb({ max: 1 }, { traced: false });
    const tenant = await loadTenant(db, context.params.tenantId);
    const quiet = resolveTenantSettings(tenant.settings).sendPolicy.quietHours;
    if (!quiet) return { at: moment.at, timezone: momentZone };
    const policyZone = policyTimezone(quiet, momentZone) ?? momentZone;
    const shifted = shiftOutOfQuietHours(new Date(moment.at), quiet, policyZone);
    return { at: shifted.getTime(), timezone: momentZone };
  });
  const zone = target.timezone ?? context.timezone();

  context.current = sendStep.name;
  await runSend(context, sendStep, {
    local: {
      at: wallClock(new Date(target.at), zone),
      cancelOn: unconditionalCancelEvents(context.params.spec),
    },
  });

  context.current = name;
  const until = new Date(target.at).toISOString();
  const moment = describeInstant(target.at, target.timezone);
  await context.record(name, 'sleeping', `Waiting until ${moment}`, { until, timezone: target.timezone });
  await context.sleep(`${name}:sleep`, target.at - context.now());
  context.state.steps[name] = await context.record(name, 'completed', `Reached ${moment}`);
}

export async function runSend(
  context: RunContext,
  current: SendStep,
  options?: { local?: { at: string; cancelOn: string[] } }
): Promise<void> {
  const { name, send } = current;
  context.state.steps[name] = await context.do(`${name}:send`, async () => {
    const db = createDb({ max: 1 }, { traced: false });
    const tenant = await loadTenant(db, context.params.tenantId);

    if (send.skipIfSentWithin && context.hasSubscriber) {
      const from = new Date(context.now() - durationSeconds(send.skipIfSentWithin) * 1000);
      if (await sentRecently(db, context, current, from)) {
        const what = send.topic ? `A ${send.topic} message` : 'This message';
        const window = describeDuration(send.skipIfSentWithin);
        await context.report(name, 'skipped', `Skipped: ${what.toLowerCase()} went out within ${window}`);
        return { at: new Date(context.now()).toISOString(), skipped: true };
      }
    }

    const scope = context.scope();
    const rendering = context.rendering();
    const title = send.title !== undefined ? renderTemplate(send.title, scope, rendering) : null;
    const local =
      send.deliver === 'local'
        ? (options?.local ?? {
            at: wallClock(new Date(context.now()), context.timezone()),
            cancelOn: unconditionalCancelEvents(context.params.spec),
          })
        : null;
    const payload = {
      ...(send.channel ? { channel: send.channel } : {}),
      ...(send.topic ? { topic: send.topic } : {}),
      ...(title !== null ? { title } : {}),
      ...(send.body !== undefined ? { body: renderTemplate(send.body, scope, rendering) } : {}),
      ...(send.subtitle !== undefined ? { subtitle: renderTemplate(send.subtitle, scope, rendering) } : {}),
      ...(send.data !== undefined
        ? { data: renderValue(send.data, scope, rendering) as Record<string, unknown> }
        : {}),
      ...(send.imageUrl !== undefined ? { imageUrl: renderTemplate(send.imageUrl, scope, rendering) } : {}),
      ...(send.sound !== undefined ? { sound: send.sound } : {}),
      ...(send.badge !== undefined ? { badge: send.badge } : {}),
      ...(send.threadId !== undefined ? { threadId: renderTemplate(send.threadId, scope, rendering) } : {}),
      ...(send.collapseId !== undefined
        ? { collapseId: renderTemplate(send.collapseId, scope, rendering) }
        : {}),
      ...(send.interruptionLevel !== undefined ? { interruptionLevel: send.interruptionLevel } : {}),
      ...(send.relevanceScore !== undefined ? { relevanceScore: send.relevanceScore } : {}),
      ...(send.priority !== undefined ? { priority: send.priority } : {}),
      ...(send.deepLink !== undefined ? { deepLink: renderTemplate(send.deepLink, scope, rendering) } : {}),
      ...(send.action !== undefined
        ? {
            action: {
              name: send.action.name,
              ...(send.action.data !== undefined
                ? { data: renderValue(send.action.data, scope, rendering) as Record<string, unknown> }
                : {}),
            },
          }
        : {}),
      ...(send.actions !== undefined ? { actions: send.actions } : {}),
      ...(send.policy !== undefined ? { policy: send.policy } : {}),
      ...(local
        ? {
            deliver: 'local' as const,
            local: {
              id: `${context.params.runId}:${name}`,
              at: local.at,
              ...(local.cancelOn.length > 0 ? { cancelOn: local.cancelOn } : {}),
            },
          }
        : {}),
    };

    if (!context.live) {
      if (send.topic) await findTopicBySlug(db, tenant.id, send.topic);
      await context.report(name, 'completed', title ? `Would send “${title}”` : 'Would send a message', {
        payload,
      });
      return { at: new Date(context.now()).toISOString(), messageId: null, skipped: false };
    }

    const { message } = await createMessage(db, tenant, {
      to: [context.params.externalId],
      ...payload,
      idempotencyKey: `${context.params.runId}:${name}`,
      run: { id: context.params.runId, step: name },
    });
    await enqueueFanout(message.id);

    const messageId = encodeId('message', message.id);
    const summary = local
      ? title
        ? `Scheduled “${title}” on the device`
        : 'Scheduled a local notification on the device'
      : title
        ? `Sent “${title}”`
        : 'Sent a message';
    await context.report(name, 'completed', summary, { messageId });
    return { at: new Date(context.now()).toISOString(), messageId, skipped: false };
  });
}
