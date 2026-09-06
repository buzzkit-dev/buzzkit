<!-- Header -->
<div align="center">
  <a href="https://buzzkit.dev">
    <img src="https://buzzkit.dev/icon.png" alt="BuzzKit" height="96" />
  </a>

  <h3 align="center">BuzzKit SDK</h3>
  <b>The TypeScript SDK for BuzzKit, the open source notification orchestration layer</b>
</div>

<!-- TOC -->
<p align="center">
    <a href="https://docs.buzzkit.dev"><strong>Read the docs »</strong></a>
    <br />
    <br />
    <a href="#installation">Installation</a>
    ·
    <a href="#send">Send</a>
    ·
    <a href="#subscribers">Subscribers</a>
    ·
    <a href="#browser-and-react">Browser and React</a>
    ·
    <a href="#webhooks">Webhooks</a>
    ·
    <a href="#entry-points">Entry points</a>
</p>

## Installation

```sh
npm install buzzkit
```

Node 22 or newer, and it runs unchanged in Bun, Deno, Cloudflare Workers and the browser.

## Send

Create a client with a workspace or tenant key from the dashboard. Every call is typed against the API, so an unknown field or a wrong status is a compile error, not a runtime surprise.

```ts
import { BuzzKit } from 'buzzkit';

const buzzkit = new BuzzKit({ apiKey: process.env.BUZZKIT_API_KEY });

await buzzkit.messages.send({
  to: 'user_42',
  title: 'Your order shipped',
  body: 'Arrives Thursday',
});
```

Send to a topic, a saved segment, or an inline expression:

```ts
await buzzkit.messages.send({ topic: 'product-updates', title: 'New in BuzzKit' });
await buzzkit.messages.send({ segment: 'power-users', title: 'Early access' });
await buzzkit.messages.send({
  where: { attribute: 'plan', eq: 'pro' },
  title: 'Your plan changed',
});
```

Sends are idempotent. The SDK attaches an idempotency key when you do not, so a retry after a timeout never sends twice.

## Subscribers

`identify` keeps a person's profile in sync so segments and templates have something to read. It is an upsert, safe to call on every login.

```ts
await buzzkit.identify('user_42', {
  email: 'ada@example.com',
  attributes: { plan: 'pro', seats: 12 },
});
```

A subscriber handle binds the id once, so it can never be passed twice or disagree:

```ts
const user = buzzkit.subscriber('user_42');

await user.track('cart.abandoned', { value: 79 });
await user.send({ title: 'Still there?' });

const preferences = await user.preferences();
const timeline = await user.timeline({ limit: 50 });
```

Every list is a page you can await or walk:

```ts
const first = await buzzkit.subscribers.list({ search: 'ada' });

for await (const page of buzzkit.subscribers.list()) {
  console.log(page.items.length);
}
```

## Browser and React

`buzzkit/client` holds a publishable key and never a secret one. It refuses a server key, so a full-tenant credential cannot reach a browser bundle by mistake.

```ts
import { BuzzKitClient } from 'buzzkit/client';

const client = new BuzzKitClient({
  publishableKey: 'bk_pk_...',
  identity: { externalId: 'user_42', identityHash },
});
```

The identity hash is minted on your server, never in the browser:

```ts
import { signIdentity } from 'buzzkit';

const identityHash = await signIdentity('user_42', process.env.BUZZKIT_IDENTITY_SECRET);
```

`buzzkit/react` wraps the same client:

```tsx
import { BuzzKitProvider, usePreferences } from 'buzzkit/react';

function Settings() {
  const { data, update, isLoading } = usePreferences();

  if (isLoading || !data) return null;

  return data.map((topic) => (
    <Toggle
      key={topic.slug}
      checked={topic.channels.push?.optedIn ?? false}
      onChange={(optedIn) => update({ [topic.slug]: { push: optedIn } })}
    />
  ));
}
```

## Webhooks

Verify a delivery before you trust it. The raw body must be passed exactly as received.

```ts
import { verifyWebhook } from 'buzzkit/webhooks';

const event = await verifyWebhook(rawBody, request.headers, process.env.BUZZKIT_WEBHOOK_SECRET);
```

## Retries

Retries cover connection failures, timeouts, 429 and 5xx, and only for requests that are safe to repeat: GET, PUT, DELETE, or a POST carrying an idempotency key, which `messages.send` generates for you.

A `Retry-After` header is honored exactly rather than shortened to the backoff ceiling. When a server asks for longer than `maxRetryAfterMs`, one minute by default, the SDK stops instead of retrying early and throws, with `retryAfterSeconds` on the error so you can queue the work rather than block a request on it. Raise `maxRetryAfterMs` where waiting is cheap, such as a background job.

```ts
try {
  await buzzkit.messages.send({ to: 'user_42', title: 'Hello' });
} catch (error) {
  if (error instanceof BuzzKitError && error.retryAfterSeconds) {
    await scheduleForLater(error.retryAfterSeconds);
  }
}
```

## Entry points

| Entry | Runs | Holds |
| --- | --- | --- |
| `buzzkit` | server | The API client, identity signing, the shared vocabularies |
| `buzzkit/client` | browser | The publishable-key client |
| `buzzkit/react` | browser | `BuzzKitProvider` and the hooks |
| `buzzkit/webhooks` | server | Signing and verification |
| `buzzkit/expressions` | either | The segment expression grammar |
| `buzzkit/workflows` | either | The workflow spec grammar |
| `buzzkit/sources` | either | The source mapping grammar |

React is an optional peer dependency, so a server-only install never pulls it.

## License

MIT. The BuzzKit core is licensed under the [GNU Affero General Public License Version 3](https://github.com/buzzkit-dev/buzzkit/blob/main/LICENSE).
