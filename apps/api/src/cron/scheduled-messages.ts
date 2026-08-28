import { releaseDueMessages } from '@buzzkit/api/api/messages/index';
import { createDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';

export async function runScheduledMessagesTick(now = new Date()): Promise<void> {
  await trace('scheduler.messages', async (t) => {
    const db = createDb({ max: 2 });
    const result = await releaseDueMessages(db, now);
    t.set('messages.released', result.released);
    t.set('messages.batches', result.batches);
    if (result.released > 0 || result.batches > 0) log.info('[Scheduled messages] Tick', result);
  });
}
