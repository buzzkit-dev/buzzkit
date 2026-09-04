import type { FaqItem } from './content';

export const whyFaq: FaqItem[] = [
  {
    question: 'How much do I have to build myself?',
    answer:
      'The SDK at launch and the events you already know about. Configure, identify, register for push and track: after that the token lifecycle, targeting, scheduling, preferences, retries and the delivery record are the platform’s job, not code in your app or your backend.',
  },
  {
    question: 'Do I need server code for lifecycle notifications?',
    answer:
      'No. A workflow starts on an event and holds the waits, branches, loops and sends, so the trial reminder or the win-back is a versioned spec you publish instead of a cron job, a queue and a table in your database. Your backend only reports what happened.',
  },
  {
    question: 'What does an agent need before the first send?',
    answer:
      'An account, the APNs key of the app uploaded to its tenant, and a workspace API key from the dashboard. After that it is one PUT to create the subscriber and one POST to send; the OpenAPI document lists every operation with the scope it needs.',
  },
  {
    question: 'How does an agent confirm a send worked?',
    answer:
      'POST /v1/messages answers 202 with a message id. GET /v1/messages/:id/deliveries lists one delivery per device with its status, and GET /v1/deliveries/:id/attempts shows every attempt with the provider response and latency.',
  },
  {
    question: 'Can an agent test without reaching real users?',
    answer:
      'Yes. A second tenant is fully isolated, so its subscribers, credentials and sends never touch production, and an APNs key scoped to the sandbox environment only reaches development builds. Workflows also have a dry run that reports what a version would do without sending.',
  },
  {
    question: 'Does BuzzKit replace APNs and FCM?',
    answer:
      'No. It runs on your own Apple and Firebase credentials and pays nothing to anyone in between. BuzzKit is the layer above the providers: subscribers, targeting, scheduling, preferences, retries and the ledger.',
  },
  {
    question: 'What if the app is not on iOS?',
    answer:
      'Wait, or self-host and follow along. iOS is supported today; Android arrives as the next connector on the same core, and email and SMS follow. The API and the data model do not change when they land.',
  },
];
