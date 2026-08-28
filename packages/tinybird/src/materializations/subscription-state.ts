import { defineMaterializedView, node } from '@tinybirdco/sdk';
import { subscriptionState } from '../datasources/subscription-state';

export const subscriptionStateMv = defineMaterializedView('subscription_state_mv', {
  description:
    'Registration, invalidation and removal drive status_code; mute, unmute and registration drive enabled_code; both carry the sequence so the latest write wins',
  datasource: subscriptionState,
  nodes: [
    node({
      name: 'state',
      sql: `
        SELECT
          tenant_id,
          subscriber_id,
          JSONExtractString(data_raw, 'channel') AS channel,
          JSONExtractString(data_raw, 'endpoint') AS endpoint,
          JSONExtractString(data_raw, 'platform') AS platform,
          multiIf(
            name = '$subscription.registered', sequence * 4 + 1,
            name = '$subscription.invalidated', sequence * 4 + 2,
            name = '$subscription.removed', sequence * 4 + 3,
            0
          ) AS status_code,
          multiIf(
            name = '$subscription.muted', sequence * 4 + 2,
            name = '$subscription.unmuted', sequence * 4 + 1,
            name = '$subscription.registered',
              sequence * 4 + if(JSONHas(data_raw, 'enabled') AND NOT JSONExtractBool(data_raw, 'enabled'), 2, 1),
            0
          ) AS enabled_code
        FROM events
        WHERE name IN (
          '$subscription.registered', '$subscription.invalidated', '$subscription.removed',
          '$subscription.muted', '$subscription.unmuted'
        )
      `,
    }),
  ],
});
