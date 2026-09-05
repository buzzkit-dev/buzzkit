import type { FeaturePage } from './index';

export const liveActivities: FeaturePage = {
  slug: 'live-activities',
  name: 'Live Activities',
  icon: 'IconLiveFullFilled',
  group: 'Send',
  summary: 'Start, update and end iOS Live Activities from the same API that sends your push.',
  blurb: 'Start, update and end from the API',
  title: 'Live Activities on the lock screen.',
  continuation: 'Start, update, end.',
  intro:
    'A Live Activity keeps a delivery, a ride or a match score on the lock screen and in the Dynamic Island. The SDK registers the tokens, and your backend drives every state change through one endpoint, addressed to a subscriber, with the same credentials as your push.',
  vignette: 'activity',
  sections: [
    {
      title: 'One endpoint for the whole lifecycle',
      text: 'Start it, update it as things move, end it when they are done. Every call names a subscriber and an activity, carries the new state and an optional alert, and reports what Apple answered for each token.',
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
      title: 'Tokens handled by the SDK',
      text: 'Activity tokens rotate and push-to-start tokens arrive before an activity exists. The SDK registers and refreshes both against the subscriber, so your backend never sees a token, only a person and an activity id.',
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
      title: 'Ended activities and the event stream',
      text: 'Started, ended, dismissed and stale all land on the subscriber’s timeline, so a segment or a workflow can react to a Live Activity the same way it reacts to any other event.',
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
      text: 'Open an activity on the lock screen before the app is even opened, with a push-to-start token.',
    },
    {
      title: 'Per-token outcomes',
      text: 'Each send reports what Apple answered for every token.',
    },
    {
      title: 'Attributes and content state',
      text: 'ActivityKit attributes and dynamic state travel as plain JSON.',
    },
    {
      title: 'Alerts on update',
      text: 'Attach an alert and an update also notifies.',
    },
    {
      title: 'Sandbox and production',
      text: 'The environment picks the right Apple credential, like any push.',
    },
    {
      title: 'Ledger like everything else',
      text: 'Every attempt is recorded with the same detail as a push.',
    },
  ],
  faq: [
    {
      question: 'How do I update a Live Activity from my backend?',
      answer:
        'Post to /v1/live-activities/send with the subscriber id, the activity id, event update and the new content state. BuzzKit finds the token and reports what Apple answered.',
    },
    {
      question: 'Can I start a Live Activity without the user opening the app?',
      answer:
        'Yes, once the SDK has registered a push-to-start token for that activity type. Send a start event with the attributes and the first content state.',
    },
    {
      question: 'Does this work for Android?',
      answer:
        'Live Activities are an iOS feature, and iOS is where BuzzKit starts. Android follows on the same core.',
    },
  ],
  related: ['ios-sdk', 'sending', 'delivery'],
};
