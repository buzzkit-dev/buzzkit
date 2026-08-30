import { reconcileWebhooks } from '@buzzkit/api/queue/webhooks';
import { EVERY_MINUTE } from './constants';
import { reconcileDeliveries } from './reconcile';
import { rewrapSecrets } from './rewrap';
import { releaseScheduledMessages } from './scheduled-messages';
import { purgeSources } from './sources';
import { releaseWorkflowSchedules } from './workflow-schedules';

export async function handleScheduled(controller: ScheduledController): Promise<void> {
  const now = new Date(controller.scheduledTime);
  if (controller.cron === EVERY_MINUTE) {
    await releaseScheduledMessages(now);
    await releaseWorkflowSchedules(now);
    return;
  }
  await reconcileDeliveries();
  await reconcileWebhooks();
  await rewrapSecrets();
  await purgeSources();
}
