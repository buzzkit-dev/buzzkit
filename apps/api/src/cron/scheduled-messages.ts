import { releaseDueMessages } from '@buzzkit/api/api/messages/index';
import { sweep } from './sweep';

export async function releaseScheduledMessages(now: Date): Promise<void> {
  await sweep('messages', (db) => releaseDueMessages(db, now));
}
