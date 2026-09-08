import type { FeaturePage } from './index';

export const sources: FeaturePage = {
  slug: 'sources',
  name: 'Sources',
  icon: 'IconMailboxFilled',
  group: 'Automate',
  summary: 'Connect Stripe, Superwall, RevenueCat or your own webhooks, and turn them into events.',
  blurb: 'Webhooks into events',
  title: 'Turn webhooks into notifications.',
  continuation: 'Stripe, Superwall, RevenueCat, or your own.',
  intro:
    'A payment or a cancellation becomes a subscriber event, verified, matched to the right person and deduplicated before a workflow ever sees it.',
  vignette: 'sources',
  sections: [
    {
      title: 'Pick a provider, paste the secret.',
      text: 'Choose one of the presets or a custom source, and verification and a default mapping come filled in.',
      code: `POST /v1/sources
{
  "name": "Stripe billing",
  "provider": "stripe",
  "secret": "whsec_…"
}`,
    },
    {
      title: 'Decide which events matter.',
      text: 'Pick the ones worth keeping, name them, and say how to find the person they belong to.',
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
      title: 'See what happened to every webhook.',
      text: 'Each one is recorded as an event, a duplicate, dropped or rejected, and you can replay it before changing a mapping.',
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
      text: 'Each preset knows the provider’s payload, so there is nothing to work out.',
    },
    {
      title: 'Custom sources',
      text: 'Anything that can post JSON with a shared secret works too.',
    },
    {
      title: 'Subscriber lookup',
      text: 'BuzzKit finds the person by your user id or any attribute you store.',
    },
    {
      title: 'Write-only secrets',
      text: 'A signing secret is encrypted and never returned by the API.',
    },
    {
      title: 'Pause without losing anything',
      text: 'Deliveries keep being recorded while a source is paused, and no events are created until you resume.',
    },
    {
      title: 'Audit and webhooks',
      text: 'Every change is an audit entry and an outbound webhook.',
    },
  ],
  faq: [
    {
      question: 'Where do I point the provider’s webhook?',
      answer:
        'Every source gets its own ingest URL when you create it. Paste that into the provider, and signatures are checked from the first request.',
    },
    {
      question: 'What if BuzzKit does not know that customer yet?',
      answer:
        'The delivery is recorded as dropped and no event is created. Store the provider’s customer id as an attribute so the next one matches.',
    },
  ],
  related: ['workflows', 'segments', 'sending'],
};
