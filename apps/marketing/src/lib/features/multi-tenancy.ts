import type { FeaturePage } from './index';

export const multiTenancy: FeaturePage = {
  slug: 'multi-tenancy',
  name: 'Multi-tenancy',
  icon: 'IconLayersTwoFilled',
  group: 'Platform',
  summary: 'One workspace, a tenant per customer, each with isolated subscribers, credentials and sends.',
  blurb: 'A tenant per customer, one key',
  title: 'Send for your customers.',
  continuation: 'One workspace, a tenant per app, one key.',
  intro:
    'A tenant is one of your customers: its own subscribers, topics, credentials, segments, workflows and messages, isolated from every other tenant. Your platform stores one workspace key and names the tenant on each request. An app with a single tenant never notices any of this.',
  vignette: 'tenants',
  sections: [
    {
      title: 'One key, one header',
      text: 'Create tenants with your workspace key and act on them with the same key. A tenant-scoped call adds a header naming the tenant, the way a Stripe platform names a connected account. Without the header, the default tenant answers.',
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
      title: 'Isolated by default',
      text: 'Each tenant brings its own Apple and Firebase credentials, and its subscribers, topics, segments, workflows, sources and messages never mix. Members, API keys and the audit log belong to the workspace and stay shared.',
      code: `GET /v1/subscribers
buzzkit-tenant: gymly

// Only Gymly’s subscribers, on Gymly’s credentials
{
  "data": [{ "externalId": "user_42" }],
  "total": 13460
}`,
    },
    {
      title: 'Keys with a smaller blast radius',
      text: 'A tenant key is locked to one tenant and can only reach that tenant’s data, for handing a customer or a subsystem direct access. Every tenant also gets a client key that ships in the app and can only identify subscribers and register devices.',
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
      text: 'Store your own ids in the tenant’s metadata and find it by them.',
    },
    {
      title: 'Settings per tenant',
      text: 'Pause a channel or require identity verification for one tenant only.',
    },
    {
      title: 'Identity secret',
      text: 'A per-tenant secret proves who a subscriber is. Rotate it any time.',
    },
    {
      title: 'Dashboard switcher',
      text: 'Inspect any tenant’s subscribers, messages and runs from the workspace switcher.',
    },
    {
      title: 'Audit trail',
      text: 'Creating, changing and deleting tenants lands in the workspace audit log.',
    },
  ],
  faq: [
    {
      question: 'Is a tenant an environment?',
      answer:
        'No. A tenant is a customer or an app you send for, with its own data and credentials. Environments are handled by the credentials themselves: an Apple key covers sandbox and production.',
    },
    {
      question: 'Do I need an API key per tenant?',
      answer:
        'No. Store one workspace key and pass the tenant slug in the buzzkit-tenant header. Tenant keys exist for delegating one tenant’s access and are never required.',
    },
    {
      question: 'Can I delete a tenant?',
      answer:
        'Yes. Deleting a tenant revokes its tenant keys and hides its data. The default tenant cannot be deleted or renamed.',
    },
  ],
  related: ['sending', 'delivery', 'topics'],
};
