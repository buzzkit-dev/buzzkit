import { env } from 'cloudflare:workers';

const SITE_URL = 'https://buzzkit.dev';

export const DOCUMENT_INFO = {
  title: 'BuzzKit API',
  version: '1.0.0',
  description:
    'The BuzzKit REST API: subscribers, subscriptions, topics, events, segments, messages, workflows, sources and webhooks, all under /v1. Every response is a JSON envelope { success, data, error, metadata }; errors carry a lowercase snake_case code, a message and, when a field is at fault, its param.',
  contact: { name: 'BuzzKit', url: SITE_URL, email: 'hello@buzzkit.dev' },
  license: { name: 'AGPL-3.0', url: 'https://github.com/buzzkit-dev/buzzkit/blob/main/LICENSE' },
};

export const DOCUMENT_SERVERS = [
  { url: 'https://api.buzzkit.dev', description: 'BuzzKit Cloud' },
  { url: 'http://localhost:8790', description: 'Local development' },
];

export const BEARER_SCHEME = {
  type: 'http' as const,
  scheme: 'bearer',
  description:
    'An API key from the dashboard. The scopes listed on each operation are the `resource:action` grants a key needs (`messages:send`, `subscribers:read`, `topics:*`, `*`); `account:*` scopes and key management are session-only. Workspace keys (bk_ws_) are what a backend uses: they resolve to the default tenant on their own, so an integration that does not use tenants sends no extra header, and add buzzkit-tenant only to address a different tenant. Tenant keys (bk_tn_) are locked to one tenant and need no header either; client keys (bk_pk_) ship inside an app and only work on /v1/client/*.',
};

export const documentation = {
  info: DOCUMENT_INFO,
  servers: env.ENVIRONMENT === 'development' ? [...DOCUMENT_SERVERS].reverse() : DOCUMENT_SERVERS,
  externalDocs: { description: 'BuzzKit documentation', url: 'https://docs.buzzkit.dev' },
  security: [{ bearerAuth: [] }],
  components: { securitySchemes: { bearerAuth: BEARER_SCHEME } },
};
