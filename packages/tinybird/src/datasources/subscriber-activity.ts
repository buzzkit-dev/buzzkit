import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const subscriberActivity = defineDatasource('subscriber_activity', {
  description: 'Per subscriber: first event, last event from a device, events counted',
  jsonPaths: false,
  schema: {
    tenant_id: t.uint64(),
    subscriber_id: t.uint64(),
    first_seen: t.simpleAggregateFunction('min', t.dateTime64(3)),
    last_seen: t.simpleAggregateFunction('max', t.dateTime64(3)),
    events: t.simpleAggregateFunction('sum', t.uint64()),
  },
  engine: engine.aggregatingMergeTree({
    sortingKey: ['tenant_id', 'subscriber_id'],
  }),
});
