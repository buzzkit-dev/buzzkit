import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api } from '@buzzkit/api/contract';
import { openapi } from '@elysiajs/openapi';
import Elysia from 'elysia';

type Operation = Record<string, unknown> & { operationId?: string; summary?: string; tags?: string[] };
type Document = {
  openapi: string;
  info: Record<string, unknown>;
  servers?: { url: string; description: string }[];
  security?: Record<string, string[]>[];
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, unknown>;
};

const SITE_URL = 'https://buzzkit.dev';
const API_URL = 'https://api.buzzkit.dev';
const ACTIONS: Record<string, string> = {
  cancel: 'Cancel',
  publish: 'Publish',
  pause: 'Pause',
  validate: 'Validate',
  rotate: 'Rotate',
  replay: 'Replay',
  preview: 'Preview',
  test: 'Test',
  accept: 'Accept',
  resend: 'Resend',
};

function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('xes')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function words(segment: string): string {
  return segment.replaceAll('-', ' ');
}

const OVERRIDES: Record<string, string> = {
  'get /v1/tenants/{tenantSlug}/identity-secret': 'Get the tenant identity secret',
  'post /v1/tenants/{tenantSlug}/identity-secret/rotate': 'Rotate the tenant identity secret',
  'post /v1/sources/{id}/ingest': 'Ingest a source delivery',
  'patch /v1/subscribers/{externalId}/preferences': 'Update subscriber preferences',
  'get /v1/subscribers/{externalId}/preferences': 'Get subscriber preferences',
  'get /v1/subscribers/{externalId}/timeline': 'Get a subscriber timeline',
  'get /v1/workflows/{workflowSlug}/schedule': 'Get a workflow schedule',
  'get /v1/events/token': 'Get an events token',
  'get /v1/events/volume': 'Get event volume',
  'get /v1/stats': 'Get stats',
  'post /v1/client/identify': 'Identify a subscriber',
  'get /v1/client/preferences': 'Get client preferences',
  'patch /v1/client/preferences': 'Update client preferences',
  'post /v1/client/events': 'Track client events',
  'post /v1/client/live-activities': 'Register a client live activity',
  'delete /v1/client/live-activities/{id}': 'End a client live activity',
  'post /v1/live-activities/send': 'Send a live activity update',
};

function article(noun: string): string {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function identifier(summary: string): string {
  return summary
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word && word !== 'a' && word !== 'an' && word !== 'the')
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

function summarize(method: string, path: string): string {
  const override = OVERRIDES[`${method} ${path}`];
  if (override) return override;

  const segments = path.split('/').filter((segment) => segment && segment !== 'v1');
  const statics = segments.filter((segment) => !segment.startsWith('{'));
  const isItem = (segments.at(-1) ?? '').startsWith('{');
  const resource = words(statics.at(-1) ?? 'resource');
  const parent = statics.length > 1 ? words(singular(statics.at(-2) ?? '')) : '';
  const qualified = (noun: string) => (parent ? `${parent} ${noun}` : noun);

  if (method === 'post' && !isItem && ACTIONS[statics.at(-1) ?? '']) {
    return `${ACTIONS[statics.at(-1) ?? '']} ${article(words(singular(statics.at(-2) ?? resource)))}`;
  }
  if (method === 'get' && isItem) return `Get ${article(qualified(singular(resource)))}`;
  if (method === 'get')
    return singular(resource) === resource ? `Get ${resource}` : `List ${qualified(resource)}`;
  if (method === 'post') {
    if (resource === 'messages') return 'Send a message';
    if (resource === 'events') return 'Track events';
    return `Create ${article(qualified(singular(resource)))}`;
  }
  if (method === 'put') return `Upsert ${article(qualified(singular(resource)))}`;
  if (method === 'patch') return `Update ${article(qualified(singular(resource)))}`;
  return `Delete ${article(qualified(singular(resource)))}`;
}

function resolveScopes(): Map<string, string> {
  const root = resolve(import.meta.dirname, '../../src/modules/v1');
  const scopes = new Map<string, string>();
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('index.ts')
  );
  for (const file of files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    const handlers = [...source.matchAll(/\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)];
    handlers.forEach((handler, index) => {
      const segment = source.slice(handler.index, handlers[index + 1]?.index ?? source.length);
      const declared = /\b(scope|tenant|account|client):\s*(?:'([^']+)'|true)/.exec(segment);
      if (!declared) return;
      const path = `/v1${handler[2]}`.replaceAll(/:([A-Za-z]+)/g, '{$1}');
      const scope =
        declared[1] === 'account'
          ? `account:${declared[2]}`
          : declared[1] === 'client'
            ? 'client'
            : declared[2]!;
      scopes.set(`${handler[1]} ${path}`, scope);
    });
  }
  return scopes;
}

const ERROR_RESPONSES: Record<string, string> = {
  '400':
    'The request is malformed or fails validation; `error.code` is `validation`, `bad_request` or `parse` and `error.details` lists every failing field.',
  '401':
    'No credential, or an invalid, expired or revoked one: `missing_authorization`, `invalid_api_key`, `api_key_expired`, `invalid_session`.',
  '403':
    'The credential cannot do this: `missing_permission` for a missing scope, `forbidden` for another workspace, tenant or key kind.',
  '404': 'The addressed resource does not exist for this credential, including malformed ids.',
  '409': 'The write conflicts with existing state: `conflict`.',
};

function attachErrorResponses(operation: Operation, method: string): void {
  const responses = operation.responses as Record<string, unknown>;
  for (const [status, description] of Object.entries(ERROR_RESPONSES)) {
    if (status === '409' && method === 'get') continue;
    responses[status] = {
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }
}

function describe(spec: Document): Document {
  const scopes = resolveScopes();
  const packageVersion = (
    JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  const seen = new Map<string, number>();
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const summary = summarize(method, path);
      const operationId = identifier(summary);
      const count = seen.get(operationId) ?? 0;
      seen.set(operationId, count + 1);
      operation.summary = summary;
      operation.operationId = count === 0 ? operationId : `${operationId}${count + 1}`;
      const scope = scopes.get(`${method} ${path}`);
      operation.security = scope ? [{ bearerAuth: [scope] }] : [];
      if (scope) attachErrorResponses(operation, method);
    }
  }
  return {
    openapi: spec.openapi,
    info: {
      title: 'BuzzKit API',
      version: packageVersion,
      description:
        'The BuzzKit REST API: subscribers, subscriptions, topics, events, segments, messages, workflows, sources and webhooks, all under /v1. Every response is a JSON envelope { success, data, error, metadata }; errors carry a lowercase snake_case code, a message and, when a field is at fault, its param.',
      contact: { name: 'BuzzKit', url: SITE_URL, email: 'hello@buzzkit.dev' },
      license: { name: 'AGPL-3.0', url: 'https://github.com/buzzkit-dev/buzzkit/blob/main/LICENSE' },
    },
    externalDocs: { description: 'BuzzKit documentation', url: 'https://docs.buzzkit.dev' },
    servers: [
      { url: API_URL, description: 'BuzzKit Cloud' },
      { url: 'http://localhost:8790', description: 'Local development' },
    ],
    security: [{ bearerAuth: [] }],
    paths: spec.paths,
    components: {
      ...spec.components,
      schemas: {
        ...((spec.components.schemas as Record<string, unknown> | undefined) ?? {}),
        Error: {
          type: 'object',
          description:
            'The envelope every error uses. `error.code` is a stable lowercase snake_case code, `error.param` names the offending field when there is one, and `metadata.requestId` is what to quote in support requests.',
          required: ['success', 'data', 'error', 'metadata'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            data: { type: 'null' },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'invalid_api_key' },
                message: { type: 'string' },
                param: { type: 'string', nullable: true },
                details: { nullable: true },
              },
            },
            metadata: {
              type: 'object',
              required: ['timestamp'],
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An API key from the dashboard. The scopes listed on each operation are the `resource:action` grants a key needs (`messages:send`, `subscribers:read`, `topics:*`, `*`); `account:*` scopes and key management are session-only.  Workspace keys (bk_ws_) reach every tenant and pick one with the buzzkit-tenant header; tenant keys (bk_tn_) are locked to one tenant; client keys (bk_pk_) ship inside an app and only work on /v1/client/*. Keys carry scopes such as messages:write or subscribers:read.',
        },
      },
    },
  } as Document;
}

const app = new Elysia().use(openapi({ path: '/openapi' })).use(api);
const response = await app.handle(new Request('http://buzzkit/openapi/json'));
const emitted = describe((await response.json()) as Document);
const target = resolve(import.meta.dirname, '../../../marketing/public/openapi.json');
writeFileSync(target, `${JSON.stringify(emitted, null, 2)}\n`);
process.stdout.write(`[OpenAPI] Wrote ${Object.keys(emitted.paths).length} paths to ${target}\n`);
