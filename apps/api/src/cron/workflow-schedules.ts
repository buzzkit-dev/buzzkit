import { releaseDueSchedules } from '@buzzkit/api/api/workflows/index';
import { sweep } from './sweep';

export async function releaseWorkflowSchedules(now: Date): Promise<void> {
  await sweep('workflows', (db) => releaseDueSchedules(db, now));
}
