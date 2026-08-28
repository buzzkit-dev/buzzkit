import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { subscriberActivity } from '../datasources/subscriber-activity';

export const subscriberActivityMv = defineMaterializedView('subscriber_activity_mv', {
  description: 'First and last activity per subscriber; last_seen counts device sources only',
  datasource: subscriberActivity,
  nodes: [
    node({
      name: 'activity',
      sql: `
        SELECT
          tenant_id,
          subscriber_id,
          min(timestamp) AS first_seen,
          maxIf(timestamp, source IN ('ios', 'android', 'web')) AS last_seen,
          count() AS events
        FROM events
        GROUP BY tenant_id, subscriber_id
      `,
    }),
  ],
});
