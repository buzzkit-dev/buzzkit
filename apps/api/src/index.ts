import { SubscriberActor as SubscriberActorClass } from './actor/subscriber';
import { handleScheduled } from './cron';
import { instrument, instrumentActor } from './libs/telemetry';
import { app } from './modules';
import { handleQueueBatch, type QueueMessage } from './queue';

const compiled = app.compile();

export default instrument<Env, QueueMessage>({
  fetch: compiled.fetch,
  queue: handleQueueBatch,
  scheduled: handleScheduled,
});

export const SubscriberActor = instrumentActor(SubscriberActorClass);
