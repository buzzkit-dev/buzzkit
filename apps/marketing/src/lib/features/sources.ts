import type { FeaturePage } from './index';

export const sources: FeaturePage = {
  slug: 'sources',
  name: 'Sources',
  icon: 'IconMailboxFilled',
  group: 'Automate',
  summary:
    'Inbound webhooks from Stripe, Superwall, RevenueCat or anything custom, turned into subscriber events.',
  blurb: 'Webhooks turned into events',
  title: 'Every webhook becomes an event.',
  continuation: 'Verified, mapped, deduplicated.',
  intro:
    'A source is an inbound webhook endpoint of a tenant. Stripe posts customer.subscription.created, the source verifies the signature, finds the subscriber and records subscription.started on their timeline, with no code on your side.',
  vignette: 'sources',
  sections: [
    {
      title: 'A provider is a template',
      text: 'Stripe, Superwall, RevenueCat and custom each fill in a verification scheme and a default mapping, both editable afterwards. Without a secret the source stays unverified and records deliveries without creating events.',
      code: `POST /v1/sources
{
  "name": "Stripe billing",
  "provider": "stripe",
  "secret": "whsec_…"
}`,
    },
    {
      title: 'The mapping decides what lands on the timeline',
      text: 'A mapping names the paths to the provider’s event type, id and timestamp, and how to find the subscriber: your external id, or a payload value matched against an attribute. Provider types map to event names, picked paths become event data, and a where clause filters what gets through.',
      code: `{
  "type": "type",
  "id": "id",
  "timestamp": "created",
  "subscriber": {
    "path": "data.object.customer",
    "attribute": "stripeCustomerId"
  },
  "events": {
    "invoice.paid": "payment.succeeded",
    "customer.subscription.deleted": "subscription.ended"
  },
  "data": { "status": "data.object.status" },
  "where": { "ref": "livemode", "eq": true }
}`,
    },
    {
      title: 'Every delivery has one outcome',
      text: 'Each request to the ingest URL is recorded as rejected, dropped with a reason, duplicate, or event with the name and subscriber it landed on. Preview a stored payload against a mapping before you change it.',
      code: `GET /v1/sources/src_2f9/deliveries
{
  "data": [
    {
      "outcome": "event",
      "providerType": "customer.subscription.created",
      "event": "subscription.started"
    },
    {
      "outcome": "duplicate",
      "providerEventId": "evt_1Q…"
    },
    { "outcome": "dropped", "reason": "no_subscriber" },
    { "outcome": "rejected", "reason": "bad_signature" }
  ]
}`,
    },
  ],
  capabilities: [
    {
      title: 'Stripe, Superwall, RevenueCat',
      text: 'Presets for the billing and paywall tools apps already run on.',
    },
    { title: 'Custom sources', text: 'Any service that posts JSON with a shared secret.' },
    {
      title: 'Subscriber lookup',
      text: 'Match by your external id or any stored attribute.',
    },
    {
      title: 'Secrets sealed at rest',
      text: 'Signing secrets are encrypted and never returned.',
    },
    {
      title: 'Pause without losing anything',
      text: 'A paused source keeps recording and drops every delivery.',
    },
    {
      title: 'Audit and webhooks',
      text: 'Every change to a source is an audit entry and a webhook event.',
    },
  ],
  faq: [
    {
      question: 'How do I turn Stripe webhooks into push notifications?',
      answer:
        'Create a Stripe source, paste its signing secret, and add the ingest URL in Stripe. Subscription events land on the subscriber’s timeline, and a workflow triggered on subscription.started sends the push.',
    },
    {
      question: 'What if a webhook arrives for a customer BuzzKit does not know?',
      answer:
        'The delivery is recorded as dropped with the reason no_subscriber and no event is created. Store the provider’s customer id as an attribute on identify so the mapping can match it.',
    },
    {
      question: 'Does BuzzKit replay duplicate webhooks?',
      answer:
        'No. The provider’s event id is the deduplication key per source, so a retried delivery is recorded as duplicate.',
    },
  ],
  related: ['workflows', 'segments', 'sending'],
};
