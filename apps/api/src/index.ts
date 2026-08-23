import type { DeliveryQueueMessage } from '@buzzkit/api/api/messages/index';
import { instrument } from './libs/telemetry';
import { app } from './modules';
import { handleDeliveryBatch } from './queue/deliveries';
import { reconcileDeliveries } from './queue/reconcile';
import { rewrapCredentialsSweep } from './queue/rewrap';

const compiled = app.compile();

export default instrument<Env, DeliveryQueueMessage>({
  fetch: compiled.fetch,
  queue: (batch) => handleDeliveryBatch(batch),
  scheduled: async () => {
    await reconcileDeliveries();
    await rewrapCredentialsSweep();
  },
});
