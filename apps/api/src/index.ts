import { SubscriberActor as SubscriberActorClass } from './actor/subscriber';
import { instrument, instrumentActor } from './libs/telemetry';
import { app } from './modules';
import { handleQueueBatch, type QueueMessage } from './queue';
import { reconcileDeliveries } from './queue/reconcile';
import { rewrapCredentialsSweep } from './queue/rewrap';

const compiled = app.compile();

export default instrument<Env, QueueMessage>({
  fetch: compiled.fetch,
  queue: handleQueueBatch,
  scheduled: async () => {
    await reconcileDeliveries();
    await rewrapCredentialsSweep();
  },
});

export const SubscriberActor = instrumentActor(SubscriberActorClass);
