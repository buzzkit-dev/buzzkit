import { createMessage, enqueueFanout } from '@buzzkit/api/api/messages/index';
import { createDb } from '@buzzkit/api/libs/database';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { eq, tables } from '@buzzkit/database';
import { renderTemplate, type SendStep } from 'buzzkit/workflows';
import type { RunContext } from '../context';

export async function runSend(context: RunContext, current: SendStep): Promise<void> {
  const { name, send } = current;
  context.state.steps[name] = await context.do(`${name}:send`, async () => {
    const db = createDb({ max: 1 }, { traced: false });
    const [tenant] = await db
      .select()
      .from(tables.tenant)
      .where(eq(tables.tenant.id, context.params.tenantId));
    if (!tenant) throw new Error('Tenant is gone');

    const scope = context.scope();
    const title = send.title !== undefined ? renderTemplate(send.title, scope) : null;
    const { message } = await createMessage(db, tenant, {
      to: [context.params.externalId],
      ...(send.channel ? { channel: send.channel } : {}),
      ...(send.topic ? { topic: send.topic } : {}),
      ...(title !== null ? { title } : {}),
      ...(send.body !== undefined ? { body: renderTemplate(send.body, scope) } : {}),
      ...(send.subtitle !== undefined ? { subtitle: renderTemplate(send.subtitle, scope) } : {}),
      ...(send.data !== undefined ? { data: send.data } : {}),
      idempotencyKey: `${context.params.runId}:${name}`,
      run: { id: context.params.runId, step: name },
    });
    await enqueueFanout(message.id);

    const messageId = encodeId('message', message.id);
    await context.report(name, 'completed', title ? `Sent “${title}”` : 'Sent a message', { messageId });
    return { at: new Date().toISOString(), messageId };
  });
}
