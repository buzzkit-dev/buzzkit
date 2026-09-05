import type { FeaturePage } from './index';

export const sources: FeaturePage = {
  slug: 'sources',
  name: 'Sources',
  icon: 'IconMailboxFilled',
  group: 'Automate',
  summary:
    'Stripe, Superwall, RevenueCat or any webhook, turned into subscriber events with no code on your side.',
  blurb: 'Webhooks turned into events',
  title: 'Every webhook becomes an event.',
  continuation: 'Verified, mapped, deduplicated.',
  intro:
    'A source turns the webhooks you already receive into events on a subscriber’s timeline. Stripe says a subscription started, the source verifies the signature, finds the customer and records it, and a workflow or a segment reacts. No endpoint to write, no code to deploy.',
  vignette: 'sources',
  sections: [
    {
      title: 'A provider is a template',
      text: 'Pick Stripe, Superwall, RevenueCat or custom, paste the signing secret, and the verification and the default mapping are filled in for you. Everything stays editable, and a source without a secret records what arrives without creating events.',
      code: `POST /v1/sources
{
  "name": "Stripe billing",
  "provider": "stripe",
  "secret": "whsec_…"
}`,
    },
    {
      title: 'The mapping decides what lands on the timeline',
      text: 'Choose which provider events become which subscriber events, which values travel along as event data, and how the subscriber is found: by your external id or by any attribute such as a Stripe customer id. A where clause keeps test mode out of production.',
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
      text: 'Nothing that hits the ingest URL goes unexplained. Each delivery is recorded as an event with the subscriber it landed on, a duplicate, dropped with a reason, or rejected, and you can replay a stored payload against a new mapping before you change it.',
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
      text: 'Presets for the billing and paywall tools apps already run on, ready in a minute.',
    },
    {
      title: 'Custom sources',
      text: 'Any service that posts JSON with a shared secret becomes a source.',
    },
    {
      title: 'Subscriber lookup',
      text: 'Match by your external id or by any stored attribute.',
    },
    {
      title: 'Secrets sealed at rest',
      text: 'Signing secrets are encrypted and never returned.',
    },
    {
      title: 'Pause without losing anything',
      text: 'A paused source keeps a record of every delivery and creates no events until you resume.',
    },
    {
      title: 'Audit and webhooks',
      text: 'Every change to a source is an audit entry and an outbound webhook.',
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
