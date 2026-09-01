import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { EVERY_FIVE_MINUTES, EVERY_MINUTE } from './constants';
import { reconcileDeliveries } from './reconcile';
import { rewrapSecrets } from './rewrap';
import { releaseScheduledMessages } from './scheduled-messages';
import { purgeSources } from './sources';
import { reconcileWebhooks } from './webhooks';
import { releaseWorkflowSchedules } from './workflow-schedules';

async function runSweeps(sweeps: Array<[string, () => Promise<void>]>): Promise<void> {
  for (const [name, run] of sweeps) {
    try {
      await run();
    } catch (error) {
      log.error('[Scheduler] Sweep failed', { sweep: name, error: describeError(error) });
    }
  }
}

export async function handleScheduled(controller: ScheduledController): Promise<void> {
  const now = new Date(controller.scheduledTime);
  if (controller.cron === EVERY_MINUTE) {
    await runSweeps([
      ['messages', () => releaseScheduledMessages(now)],
      ['workflows', () => releaseWorkflowSchedules(now)],
    ]);
    return;
  }
  if (controller.cron === EVERY_FIVE_MINUTES) {
    await runSweeps([
      ['reconcile', reconcileDeliveries],
      ['webhooks', reconcileWebhooks],
      ['rewrap', rewrapSecrets],
      ['sources', purgeSources],
    ]);
    return;
  }
  log.error('[Scheduler] Unknown cron expression', { cron: controller.cron });
}
