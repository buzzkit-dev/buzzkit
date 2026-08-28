import { defineDatasource, engine, t } from '@tinybirdco/sdk';

export const subscriberAttributes = defineDatasource('subscriber_attributes', {
  description:
    'The latest attributes of every subscriber, replayed from the stream; deleted marks a subscriber that was removed',
  schema: {
    tenant_id: t.uint64(),
    subscriber_id: t.uint64(),
    external_id: t.string(),
    sequence: t.uint64(),
    updated_at: t.dateTime64(3),
    attributes: t.json(),
    attributes_raw: t.string(),
    deleted: t.uint8(),
  },
  engine: engine.replacingMergeTree({
    ver: 'sequence',
    sortingKey: ['tenant_id', 'subscriber_id'],
  }),
});
