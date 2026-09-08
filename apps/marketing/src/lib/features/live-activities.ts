import type { FeaturePage } from './index';

export const liveActivities: FeaturePage = {
  slug: 'live-activities',
  name: 'Live Activities',
  icon: 'IconLiveFullFilled',
  group: 'Send',
  summary:
    'Start, update and end Live Activities for orders, scores and more, from the same API as your push.',
  blurb: 'Start, update, end',
  title: 'Live Activities on the lock screen.',
  continuation: 'Start, update and end from the same API.',
  intro: 'Orders, scores, deliveries. The SDK handles the tokens. Your backend drives every update.',
  vignette: 'activity',
  sections: [
    {
      title: 'One endpoint for the whole lifecycle.',
      text: 'Start it, update it, end it. Name the person and the activity.',
      code: `POST /v1/live-activities/send
{
  "to": "user_42",
  "event": "update",
  "activityId": "order_9f2",
  "contentState": { "stopsAway": 4, "eta": "12 min" },
  "alert": {
    "title": "Out for delivery",
    "body": "4 stops away."
  }
}`,
    },
    {
      title: 'Tokens handled for you.',
      text: 'The SDK registers and refreshes them. Your backend never sees a token, only a person and an activity id.',
      code: `POST /v1/client/live-activities
{
  "externalId": "user_42",
  "kind": "activity",
  "activityId": "order_9f2",
  "attributesType": "DeliveryAttributes",
  "token": "…"
}`,
    },
    {
      title: 'Workflows can react.',
      text: 'Started, ended and dismissed land on the timeline like any other event.',
      code: `POST /v1/live-activities/send
{
  "to": "user_42",
  "event": "end",
  "activityId": "order_9f2",
  "contentState": { "status": "delivered" },
  "alert": {
    "title": "Delivered",
    "body": "Left at the front door."
  }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Start from the server',
      text: 'Open an activity on the lock screen before the app is even opened.',
    },
    {
      title: 'Per device',
      text: 'Each send reports what happened on every device.',
    },
    {
      title: 'State as JSON',
      text: 'Send the current state as JSON, the same way you send a push.',
    },
    {
      title: 'Alerts on update',
      text: 'An update can also send a notification.',
    },
    {
      title: 'Native tracing',
      text: 'Every attempt is recorded, same as a push.',
    },
  ],
  faq: [],
  related: ['ios-sdk', 'sending', 'delivery'],
};
