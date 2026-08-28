import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { subscriberAttributes } from '../datasources/subscriber-attributes';

export const subscriberAttributesMv = defineMaterializedView('subscriber_attributes_mv', {
  description:
    'Every attribute snapshot on the stream becomes the current row of its subscriber; a deletion becomes an empty, deleted row',
  datasource: subscriberAttributes,
  nodes: [
    node({
      name: 'snapshot',
      sql: `
        SELECT
          tenant_id, subscriber_id, external_id, sequence, timestamp AS updated_at,
          if(name = '$subscriber.deleted', '{}', JSONExtractRaw(data_raw, 'attributes'))::JSON AS attributes,
          if(name = '$subscriber.deleted', '{}', JSONExtractRaw(data_raw, 'attributes')) AS attributes_raw,
          toUInt8(name = '$subscriber.deleted') AS deleted
        FROM events
        WHERE (
            name IN ('$subscriber.created', '$subscriber.updated', '$identify')
            AND JSONHas(data_raw, 'attributes')
          )
          OR name = '$subscriber.deleted'
      `,
    }),
  ],
});
