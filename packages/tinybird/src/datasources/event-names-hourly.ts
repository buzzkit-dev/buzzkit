import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const eventNamesHourly = defineDatasource('event_names_hourly', {
  description: 'Hourly rollup per event name: volume, reach, last seen',
  jsonPaths: false,
  schema: {
    tenant_id: t.uint64(),
    name: t.string().lowCardinality(),
    source: t.string().lowCardinality(),
    hour: t.dateTime(),
    count: t.aggregateFunction('count'),
    subscribers: t.aggregateFunction('uniq', t.uint64()),
    last_at: t.simpleAggregateFunction('max', t.dateTime64(3)),
  },
  engine: engine.aggregatingMergeTree({
    sortingKey: ['tenant_id', 'name', 'source', 'hour'],
    partitionKey: 'toYYYYMM(hour)',
    ttl: 'hour + toIntervalMonth(13)',
  }),
});
