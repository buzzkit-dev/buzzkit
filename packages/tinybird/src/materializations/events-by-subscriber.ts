import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { eventsBySubscriber } from '../datasources/events-by-subscriber';

export const eventsBySubscriberMv = defineMaterializedView('events_by_subscriber_mv', {
  description: 'Copy every event into the subscriber-sorted table',
  datasource: eventsBySubscriber,
  nodes: [
    node({
      name: 'copy',
      sql: `
        SELECT
          workspace_id, tenant_id, subscriber_id, external_id, id, sequence, name, source,
          timestamp, received_at, data, data_raw, run_id, message_id, step
        FROM events
      `,
    }),
  ],
});
