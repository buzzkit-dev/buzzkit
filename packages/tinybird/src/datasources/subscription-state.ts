import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const subscriptionState = defineDatasource('subscription_state', {
  description:
    'The state of every subscription per subscriber, channel and endpoint: status and enabled encoded as sequence * 4 + code so the latest write of each wins independently',
  jsonPaths: false,
  schema: {
    tenant_id: t.uint64(),
    subscriber_id: t.uint64(),
    channel: t.string().lowCardinality(),
    endpoint: t.string(),
    platform: t.simpleAggregateFunction('anyLast', t.string()),
    status_code: t.simpleAggregateFunction('max', t.uint64()),
    enabled_code: t.simpleAggregateFunction('max', t.uint64()),
  },
  engine: engine.aggregatingMergeTree({
    sortingKey: ['tenant_id', 'subscriber_id', 'channel', 'endpoint'],
  }),
});
