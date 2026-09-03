import type { FeaturePage } from './index';

export const liveActivities: FeaturePage = {
  slug: 'live-activities',
  name: 'Live Activities',
  icon: 'IconLiveFullFilled',
  group: 'Send',
  summary: 'Start, update and end iOS Live Activities through the same API that sends your push.',
  blurb: 'Start, update and end from the API',
  title: 'Live Activities on the lock screen.',
  continuation: 'Start, update, end.',
  intro:
    'A Live Activity keeps a delivery, a ride or a match score on the lock screen and in the Dynamic Island. The SDK registers the tokens, and your backend drives every state change through one endpoint with the same credentials as your push.',
  vignette: 'activity',
  sections: [
    {
      title: 'One endpoint for the whole lifecycle',
      text: 'Send a start event with the attributes and the first content state, an update event as it progresses, and an end event when it is over. Each call reports the APNs outcome per token.',
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
      text: 'Activity tokens change, and push-to-start tokens arrive before any activity exists. The SDK registers both against the subscriber and refreshes them on every update, so your backend only addresses a subscriber and an activity id.',
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
      text: 'When the app or the user ends an activity, the SDK marks it ended and the timeline records it, alongside started, dismissed and stale events. A segment or workflow reacts to them like any other event.',
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
      text: 'Open an activity on a device with a push-to-start token.',
    },
    { title: 'Per-token outcomes', text: 'Each send reports what APNs answered per token.' },
    {
      title: 'Attributes and content state',
      text: 'ActivityKit attributes and dynamic state as plain JSON.',
    },
    { title: 'Alerts on update', text: 'Attach an alert so an update also notifies.' },
    {
      title: 'Sandbox and production',
      text: 'The environment picks the APNs credential, like any push.',
    },
    {
      title: 'Ledger like everything else',
      text: 'The same delivery span and error taxonomy as push.',
    },
  ],
  faq: [
    {
      question: 'How do I update a Live Activity from my backend?',
      answer:
        'Post to /v1/live-activities/send with the subscriber id, the activity id, event update and the new content state. BuzzKit finds the token and reports what APNs answered.',
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
