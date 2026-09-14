import { SubscriberActor as SubscriberActorClass } from './actor/subscriber';
import { handleScheduled } from './cron';
import { instrument, instrumentActor } from './libs/telemetry';
import { handleFetch } from './modules';
import { handleQueueBatch, type QueueMessage } from './queue';

export default instrument<Env, QueueMessage>({
  fetch: handleFetch,
  queue: handleQueueBatch,
  scheduled: handleScheduled,
});

export const SubscriberActor = instrumentActor(SubscriberActorClass);

export { EngineWorkflow } from './engine';
