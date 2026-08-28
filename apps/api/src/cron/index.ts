import { SCHEDULE_TICK_CRON } from '@buzzkit/api/api/messages/constants';
import { reconcileWebhooks } from '@buzzkit/api/queue/webhooks';
import { reconcileDeliveries } from './reconcile';
import { rewrapCredentialsSweep } from './rewrap';
import { runScheduledMessagesTick } from './scheduled-messages';

export async function handleScheduled(controller: ScheduledController): Promise<void> {
  if (controller.cron === SCHEDULE_TICK_CRON) {
    await runScheduledMessagesTick(new Date(controller.scheduledTime));
    return;
  }
  await reconcileDeliveries();
  await reconcileWebhooks();
  await rewrapCredentialsSweep();
}
