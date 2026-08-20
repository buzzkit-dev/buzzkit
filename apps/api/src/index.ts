import type { DeliveryQueueMessage } from '@buzzkit/api/api/messages/index';
import { instrument } from './libs/telemetry';
import { app } from './modules';
import { handleDeliveryBatch } from './queue/deliveries';
import { reconcileDeliveries } from './queue/reconcile';

const compiled = app.compile();

export default instrument<Env, DeliveryQueueMessage>({
  fetch: compiled.fetch,
  queue: (batch) => handleDeliveryBatch(batch),
  scheduled: () => reconcileDeliveries(),
});
