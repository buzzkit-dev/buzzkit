import { createMessage, enqueueFanout } from '@buzzkit/api/api/messages/index';
import { findTopicBySlug } from '@buzzkit/api/api/topics/index';
import { createDb } from '@buzzkit/api/libs/database';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { and, type Db, eq, gte, like, or, sql, tables } from '@buzzkit/database';
import { describeDuration, durationSeconds, type SendStep } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';
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

export async function runSend(context: RunContext, current: SendStep): Promise<void> {
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
    const options = context.rendering();
    const title = send.title !== undefined ? renderTemplate(send.title, scope, options) : null;
    const payload = {
      ...(send.channel ? { channel: send.channel } : {}),
      ...(send.topic ? { topic: send.topic } : {}),
      ...(title !== null ? { title } : {}),
      ...(send.body !== undefined ? { body: renderTemplate(send.body, scope, options) } : {}),
      ...(send.subtitle !== undefined ? { subtitle: renderTemplate(send.subtitle, scope, options) } : {}),
      ...(send.data !== undefined
        ? { data: renderValue(send.data, scope, options) as Record<string, unknown> }
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
    await context.report(name, 'completed', title ? `Sent “${title}”` : 'Sent a message', { messageId });
    return { at: new Date(context.now()).toISOString(), messageId, skipped: false };
  });
}
