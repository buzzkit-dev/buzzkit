# Server SDK (`buzzkit`)

The TypeScript SDK, hand-written over `fetch`, typed against the API. Install `npm install buzzkit` (or bun/pnpm/yarn). Node 22+, and it runs unchanged in Bun, Deno, Cloudflare Workers and the browser. It is the same package the platform dogfoods.

One package, seven entry points, chosen by concern:

| Entry | Runs | Holds |
| --- | --- | --- |
| `buzzkit` | server | `BuzzKit` client, `signIdentity`, error classes, the wire vocabularies |
| `buzzkit/client` | browser | `BuzzKitClient` over the client key (`references/browser-react.md`) |
| `buzzkit/react` | browser | `BuzzKitProvider` and hooks (`references/browser-react.md`) |
| `buzzkit/webhooks` | server | `verifyWebhook`, `signWebhook`, `generateWebhookSecret` |
| `buzzkit/expressions` | either | `Expression`, `lintExpression` (`references/segments.md`) |
| `buzzkit/workflows` | either | the workflow spec grammar and vocabularies (`references/workflows.md`) |
| `buzzkit/sources` | either | the source mapping grammar (`references/sources-webhooks.md`) |

`buzzkit` throws on a `bk_pk_` key and `buzzkit/client` throws on a `bk_ws_`/`bk_tn_` key, so importing the wrong entry fails in development. React is an optional peer dependency. Every entity type lives in the `BuzzKit` namespace: `BuzzKit.Message`, `BuzzKit.Subscriber`, `BuzzKit.Topic`, `BuzzKit.WorkflowSpec`, `BuzzKit.Expression`. Error classes are flat.

## The client

```ts
import { BuzzKit } from 'buzzkit';

const buzzkit = new BuzzKit({ apiKey: process.env.BUZZKIT_API_KEY });
```

Options: `apiKey` (falls back to `BUZZKIT_API_KEY`), `baseUrl` (self-hosting), `tenant` (sets `BuzzKit-Tenant` on every call), `workspace`, `timeoutMs`, `maxRetries`, `maxRetryAfterMs`, `headers`, `fetch`.

Scopes mirror the key kinds. Tenant resources hang off the root (a workspace key resolves to its default tenant, a tenant key is locked to one) and off `buzzkit.tenant(slug)`, which sets the tenant header per call. Workspace resources sit behind `buzzkit.workspace(slug)`.

```ts
buzzkit.tenant('gymly').messages.send({ to: 'user_42', title: 'Leg day' });
await buzzkit.workspace('acme').webhooks.list();
```

## Identify, then send

```ts
await buzzkit.identify('user_42', {
  email: 'ada@example.com',
  attributes: { plan: 'pro', seats: 12, signupAt: '2026-01-05T09:00:00Z' },
  timezone: 'Europe/Berlin',
});

const message = await buzzkit.messages.send({
  to: 'user_42',
  topic: 'order-updates',
  title: 'Your order shipped',
  body: 'Arrives Thursday',
  idempotencyKey: 'order-ord_1-shipped',
});
```

`identify` is `PUT /v1/subscribers/:externalId`, an idempotent upsert on the caller's own id; call it on every login with the full attribute set the backend owns (the server PUT replaces `attributes` wholesale when present). `messages.send` answers `202` and generates a random idempotency key when none is passed; pass a meaningful one. Details of every send field: `references/messages.md`.

## The subscriber handle

```ts
const user = buzzkit.subscriber('user_42');

await user.identify({ attributes: { plan: 'pro' } });      // returns a handle whose .data is the record
await user.track('cart.abandoned', { value: 79 });
await user.send({ topic: 'cart', title: 'Still there?' });
await user.subscribe({ channel: 'push', platform: 'ios', token });
const prefs = await user.preferences();
await user.updatePreferences({ marketing: false });
const timeline = await user.timeline({ limit: 50 });
const deliveries = await user.deliveries();
const runs = await user.runs();
await user.remove();
```

`await buzzkit.identify(id, params)` returns the same handle with `.data` set. `buzzkit.subscribers.*` is the flat resource for lists and one-off writes.

## Resources and methods

Method names are `list`, `retrieve`, `create`, `update`, `remove` plus domain verbs. Never `get*` or `delete*`.

- `buzzkit.subscribers`: `list({ search, limit, cursor })`, `retrieve(externalId)`, `upsert(externalId, params)`, `remove(externalId)`, `aliases(externalId)`, `addAlias(externalId, alias)`, `subscriptions(externalId)`, `preferences(externalId)`, `updatePreferences(externalId, changes)`, `deliveries(externalId, params)`, `timeline(externalId, params)`, `runs(externalId)`.
- `buzzkit.subscriptions`: `create({ externalId, channel, platform, token })` or `create({ externalId, channel: 'email', address })`, `retrieve(id)`, `update(id, { enabled })`, `remove(id)`. Registration is idempotent per tenant, channel and endpoint; `PATCH { enabled: false }` mutes one device, `DELETE` removes it.
- `buzzkit.messages`: `list(params)`, `send(params)`, `retrieve(id)`, `cancel(id)`, `deliveries(id, params)`. See `references/messages.md`.
- `buzzkit.deliveries`: `retrieve(id)`, `attempts(id)`.
- `buzzkit.events`: `list(params)`, `track(event | events)`, `names()`, `name(name, { range })`, `volume({ range, name })`. See `references/events.md`.
- `buzzkit.topics`: `list(params)`, `create(params)`, `retrieve(slug)`, `update(slug, params)`, `remove(slug)`. `buzzkit.topicCategories`: `list()`, `update(id, { name })`, `remove(id)`. See `references/topics-preferences.md`.
- `buzzkit.segments`: `list()`, `create(params)`, `preview(expression)`, `retrieve(slug)`, `update(slug, params)`, `remove(slug)`, `members(slug, params)`. See `references/segments.md`.
- `buzzkit.workflows`: `list()`, `create(params)`, `retrieve(slug)`, `update(slug, params)`, `remove(slug)`, `publish(slug)`, `pause(slug)`, `runs(slug, params)`, `schedule(slug)`, `test(slug, params)`. `buzzkit.runs`: `list(params)`, `retrieve(runId)`. See `references/workflows.md`.
- `buzzkit.liveActivities`: `send(params)`. See `references/messages.md`.
- `buzzkit.credentials`: `list()`, `create(params)`, `retrieve(id)`, `remove(id)`, `validate(id)` (usually managed in the dashboard). `buzzkit.secrets`: `list()`, `retrieve(name)`, `upsert(name, value)`, `remove(name)` (workflow `fetch` secrets). `buzzkit.imports`: `create(rows)` (bulk migration). `buzzkit.stats`: `retrieve(params)`.
- `buzzkit.tenants`: `list(params)`, `create(params)`, `retrieve(slug)`, `update(slug, params)`, `remove(slug)`. See `references/tenants.md`.
- `buzzkit.workspace(slug)`: `webhooks` (`references/sources-webhooks.md`), `members`, `audit`, `retrieve()`, `update(params)`. `buzzkit.sources`: `list()`, `create(params)`, `retrieve(id)`, `update(id, params)`, `remove(id)`, `preview(id, params)`, `deliveries(id, params)`.

## Pagination

Every list returns a `PagePromise<T>`: `await` it for one page or `for await` it to walk every page.

```ts
const first = await buzzkit.subscribers.list({ search: 'ada', limit: 50 });
first.items; first.hasMore; first.nextCursor; first.total; // total omitted on event-stream lists

for await (const subscriber of buzzkit.subscribers.list()) { … }
```

`limit` is at most 100; pass the previous `nextCursor` to page by hand.

## Errors

```ts
import { BuzzKitError, NotFoundError, RateLimitError, isBuzzKitError } from 'buzzkit';

try {
  await buzzkit.messages.send({ to: 'user_42', title: 'Hello' });
} catch (error) {
  if (error instanceof NotFoundError) { … }
  if (isBuzzKitError(error)) console.log(error.code, error.param, error.requestId, error.status, error.retryAfterSeconds);
}
```

Classes: `BadRequestError` (400, 422), `AuthenticationError` (401), `PermissionError` (403), `NotFoundError` (404), `ConflictError` (409, 410), `RateLimitError` (429), `ServerError` (5xx), `ConnectionError`, `TimeoutError`, `ConfigurationError`. Every one carries `code` (branch on this), `param`, `details`, `requestId`, `status`.

## Retries

Connection failures, timeouts, 429 and 5xx, with jitter, for GET, PUT, DELETE and any POST carrying an idempotency key (`messages.send` generates one). A `Retry-After` longer than `maxRetryAfterMs` (one minute by default) stops the retry and throws with `retryAfterSeconds`, so queue the work rather than block a request; raise `maxRetryAfterMs` in a background job.

## Identity signing

```ts
import { signIdentity } from 'buzzkit';

const identityHash = await signIdentity(user.id, process.env.BUZZKIT_IDENTITY_SECRET);
```

`HMAC-SHA256(externalId, identitySecret)`, hex, over Web Crypto. Mint it on the server at login, hand it to the app or browser, never ship the secret. See `references/best-practices.md` §6 and `references/tenants.md`.

## Webhook verification

```ts
import { verifyWebhook } from 'buzzkit/webhooks';

const rawBody = await request.text();
const event = await verifyWebhook(rawBody, request.headers, process.env.BUZZKIT_WEBHOOK_SECRET);
```

`verifyWebhook(body, headers, secret | secret[], options?)` reads `webhook-id`, `webhook-timestamp`, `webhook-signature`, compares in constant time, and rejects anything older than five minutes (`WebhookVerificationError` with `code` `missing_headers`, `timestamp_out_of_tolerance` or `invalid_signature`). Pass the raw bytes before any parse, pass an array of secrets while rotating, then dedupe on the returned `id`. See `references/sources-webhooks.md`.
