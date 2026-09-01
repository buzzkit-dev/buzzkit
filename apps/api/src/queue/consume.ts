import { batchDb } from '@buzzkit/api/libs/database';
import { type Span, trace } from '@buzzkit/api/libs/telemetry';
import type { Db } from '@buzzkit/database';

export const CRASH_RETRY_DELAY_SECONDS = 30;

export async function consume<Message>(
  name: string,
  batch: MessageBatch<Message>,
  handler: (db: Db, span: Span) => Promise<void>
): Promise<void> {
  await trace(`queue.${name}`, { 'queue.batch_size': batch.messages.length }, async (span) => {
    await handler(batchDb(), span);
  });
}
