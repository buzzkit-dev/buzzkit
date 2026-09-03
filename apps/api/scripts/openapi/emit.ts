import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api } from '@buzzkit/api/contract';
import { BEARER_SCHEME, DOCUMENT_INFO, DOCUMENT_SERVERS, documentation } from '@buzzkit/api/libs/openapi';
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

const ERROR_SCHEMA = {
  type: 'object',
  description:
    'The envelope every error uses. `error.code` is a stable lowercase snake_case code, `error.param` names the offending field when there is one, and `metadata.requestId` is what to quote in support requests.',
  required: ['success', 'data', 'error', 'metadata'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    data: { type: 'object', nullable: true, description: 'Always null on an error.' },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: 'invalid_api_key' },
        message: { type: 'string' },
        param: { type: 'string', nullable: true },
        details: {
          type: 'array',
          nullable: true,
          description: 'Present on validation errors: one entry per failing field.',
          items: {
            type: 'object',
            properties: { param: { type: 'string' }, message: { type: 'string' } },
          },
        },
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
};

const EXPRESSION_SCHEMA = {
  description:
    'A segment condition. Groups nest with all, any and not; a leaf compares an attribute, counts an event in a window, tests activity or tests channel reachability.',
  anyOf: [
    {
      type: 'object',
      required: ['all'],
      properties: { all: { type: 'array', items: { $ref: '#/components/schemas/Expression' } } },
    },
    {
      type: 'object',
      required: ['any'],
      properties: { any: { type: 'array', items: { $ref: '#/components/schemas/Expression' } } },
    },
    {
      type: 'object',
      required: ['not'],
      properties: { not: { $ref: '#/components/schemas/Expression' } },
    },
    { type: 'object', additionalProperties: true },
  ],
};

const ANY_SCHEMA = { type: 'object', additionalProperties: true };

const SCHEMA_SLOTS = ['schema', 'items', 'additionalProperties', 'not'];

const SCHEMA_LISTS = ['anyOf', 'oneOf', 'allOf'];

function isEmptySchema(node: unknown): boolean {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && Object.keys(node).length === 0;
}

function fillSchema(node: unknown): unknown {
  return isEmptySchema(node) ? { ...ANY_SCHEMA } : node;
}

function normalizeSchemas(node: unknown): void {
  if (Array.isArray(node)) {
    for (const entry of node) normalizeSchemas(entry);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;

  if (record.type === 'null') {
    record.type = 'object';
    record.nullable = true;
  }

  delete record.$id;
  delete record.$schema;

  if ('const' in record) {
    record.enum = [record.const];
    delete record.const;
  }

  const patterned = record.patternProperties;
  if (patterned !== null && typeof patterned === 'object') {
    const [fallback] = Object.values(patterned as Record<string, unknown>);
    delete record.patternProperties;
    record.additionalProperties = fallback === undefined ? true : fillSchema(fallback);
  }

  const union = record.anyOf;
  if (Array.isArray(union) && union.some((member) => (member as Record<string, unknown>)?.type === 'null')) {
    const rest = union.filter((member) => (member as Record<string, unknown>)?.type !== 'null');
    delete record.anyOf;
    record.nullable = true;
    if (rest.length === 1) Object.assign(record, fillSchema(rest[0]));
    else if (rest.length > 1) record.anyOf = rest.map(fillSchema);
  }

  for (const slot of SCHEMA_SLOTS) {
    if (slot in record) record[slot] = fillSchema(record[slot]);
  }
  for (const list of SCHEMA_LISTS) {
    const members = record[list];
    if (Array.isArray(members)) record[list] = members.map(fillSchema);
  }
  const properties = record.properties;
  if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [name, value] of Object.entries(properties as Record<string, unknown>)) {
      (properties as Record<string, unknown>)[name] = fillSchema(value);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'example' || key === 'examples' || key === 'default' || key === 'enum') continue;
    normalizeSchemas(value);
  }
}

function linkReferences(node: unknown, known: ReadonlySet<string>): void {
  if (Array.isArray(node)) {
    for (const entry of node) linkReferences(entry, known);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const reference = record.$ref;
  if (typeof reference === 'string' && !reference.startsWith('#/')) {
    if (known.has(reference)) record.$ref = `#/components/schemas/${reference}`;
    else delete record.$ref;
  }
  for (const value of Object.values(record)) linkReferences(value, known);
}

function describe(spec: Document): Document {
  const scopes = resolveScopes();
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
    ...spec,
    info: DOCUMENT_INFO,
    servers: DOCUMENT_SERVERS,
    security: [{ bearerAuth: [] }],
    paths: spec.paths,
    components: {
      ...spec.components,
      schemas: {
        ...((spec.components.schemas as Record<string, unknown> | undefined) ?? {}),
        Expression: EXPRESSION_SCHEMA,
        Error: ERROR_SCHEMA,
      },
      securitySchemes: { bearerAuth: BEARER_SCHEME },
    },
  } as Document;
}

const app = new Elysia().use(openapi({ path: '/openapi', documentation })).use(api);
const response = await app.handle(new Request('http://buzzkit/openapi/json'));
const emitted = describe((await response.json()) as Document);
normalizeSchemas(emitted.paths);
normalizeSchemas(emitted.components);
linkReferences(
  emitted.paths,
  new Set(Object.keys((emitted.components.schemas ?? {}) as Record<string, unknown>))
);
const document = `${JSON.stringify(emitted, null, 2)}\n`;
const targets = [
  resolve(import.meta.dirname, '../../../marketing/public/openapi.json'),
  resolve(import.meta.dirname, '../../../docs/openapi.json'),
];
for (const target of targets) writeFileSync(target, document);
process.stdout.write(
  `[OpenAPI] Wrote ${Object.keys(emitted.paths).length} paths to ${targets.length} targets\n`
);
