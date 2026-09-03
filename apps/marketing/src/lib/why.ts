import type { FaqItem } from './content';

export const whyFaq: FaqItem[] = [
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
