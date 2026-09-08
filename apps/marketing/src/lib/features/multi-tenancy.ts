import type { FeaturePage } from './index';

export const multiTenancy: FeaturePage = {
  slug: 'multi-tenancy',
  name: 'Multi-tenancy',
  icon: 'IconLayersTwoFilled',
  group: 'Platform',
  summary:
    'Building on BuzzKit? Each of your customers is a tenant, with its own subscribers, credentials and notifications.',
  blurb: 'A tenant per customer',
  title: 'Send for your customers.',
  continuation: 'One workspace, a tenant per customer.',
  intro:
    'Ship notifications as part of your own product without building the push infrastructure for every customer you sign. Your own apps stay workspaces.',
  vignette: 'tenants',
  sections: [
    {
      title: 'One key, one header.',
      text: 'Create tenants with your workspace key. Name the tenant on each request, the way Stripe names a connected account. A single-app workspace never has to think about this.',
      code: `POST /v1/tenants
{
  "name": "Gymly",
  "slug": "gymly",
  "metadata": { "customerId": "cus_8f2" }
}

POST /v1/messages
buzzkit-tenant: gymly
{ "to": "user_42", "title": "Leg day" }`,
    },
    {
      title: 'Isolated by default.',
      text: 'Each tenant has its own credentials, subscribers and sends. Nothing crosses the line. Your team still sees everything.',
      code: `GET /v1/subscribers
buzzkit-tenant: gymly

{
  "data": [{ "externalId": "user_42" }],
  "total": 13460
}`,
    },
    {
      title: 'Three kinds of key.',
      text: 'A workspace key reaches every tenant, a tenant key reaches one, and a client key ships in the app.',
      code: `// Workspace key: every tenant, named per request
Authorization: Bearer bk_ws_…
buzzkit-tenant: gymly

// Tenant key: one tenant, no header needed
Authorization: Bearer bk_tn_…

// Client key: ships in the app, client API only
Authorization: Bearer bk_pk_…`,
    },
  ],
  capabilities: [
    {
      title: 'Default tenant',
      text: 'Every workspace starts with one, so a single app never has to learn about tenants.',
    },
    {
      title: 'Your customer id',
      text: 'Keep your own ids on the tenant and look it up by them later.',
    },
    {
      title: 'Settings per tenant',
      text: 'You can pause a channel for one customer and leave everyone else alone.',
    },
    {
      title: 'Identity secret',
      text: 'Each tenant has its own secret for proving who a subscriber is, and you can rotate it any time.',
    },
    {
      title: 'Dashboard switcher',
      text: 'Your team can open any tenant and see its subscribers, messages and runs.',
    },
    {
      title: 'Audit trail',
      text: 'Creating, changing and deleting a tenant all land in the workspace audit log.',
    },
  ],
  faq: [
    {
      question: 'Is a tenant an environment?',
      answer:
        'No. A tenant is a customer you send for. Sandbox and production come from the credential itself, so you do not need a tenant for each.',
    },
    {
      question: 'Can each customer bring their own Apple credentials?',
      answer:
        'Yes. A tenant holds its own, so your customers keep their own relationship with Apple and their own app.',
    },
    {
      question: 'Do I need a key per tenant?',
      answer:
        'No. You use one workspace key and name the tenant on each request. Tenant keys are there if you want to hand a customer their own access.',
    },
  ],
  related: ['sending', 'delivery', 'topics'],
};
