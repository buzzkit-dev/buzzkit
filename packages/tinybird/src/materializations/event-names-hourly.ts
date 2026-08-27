import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { eventNamesHourly } from '../datasources/event-names-hourly';

export const eventNamesHourlyMv = defineMaterializedView('event_names_hourly_mv', {
  description: 'Roll every event up per tenant, name, source and hour',
  datasource: eventNamesHourly,
  nodes: [
    node({
      name: 'rollup',
      sql: `
        SELECT
          tenant_id,
          name,
          source,
          toStartOfHour(timestamp) AS hour,
          countState() AS count,
          uniqState(subscriber_id) AS subscribers,
          max(timestamp) AS last_at
        FROM events
        GROUP BY tenant_id, name, source, hour
      `,
    }),
  ],
});
