# Browser and React

`buzzkit/client` and `buzzkit/react` hold the client key (`bk_pk_`) and an identity minted on the server. They refuse a server key, so a full-tenant credential cannot reach a browser bundle by mistake. What the browser can do follows the client API exactly: identify, track web events, read and write the subscriber's topic preferences, and register email subscriptions. There is no web push channel yet, so there is no device registration and no device-listing hook.

In Next.js: route handlers, server actions and server components take `buzzkit`; client components take `buzzkit/react`.

## The identity comes from the server

```ts
import { signIdentity } from 'buzzkit';

const identityHash = await signIdentity(user.id, process.env.BUZZKIT_IDENTITY_SECRET);
return { externalId: user.id, identityHash };
```

Mint the hash where the session is created and hand it to the page with the user. The secret never reaches the browser.

## `buzzkit/client`

```ts
import { BuzzKitClient } from 'buzzkit/client';

const client = new BuzzKitClient({
  publishableKey: 'bk_pk_…',
  identity: { externalId: 'user_42', identityHash },
});

await client.identify({ attributes: { plan: 'pro', locale: navigator.language }, email: 'ada@example.com' });
await client.track('pricing.viewed', { plan: 'pro' });
const preferences = await client.preferences();
await client.updatePreferences({ marketing: false, 'gym-reminders': { push: true } });
const subscription = await client.subscribeEmail({ address: 'ada@example.com' });
await client.updateSubscription(subscription.id, false);
await client.removeSubscription(subscription.id);
```

Options: `publishableKey` (required), `identity` (`{ externalId, identityHash? }`), `baseUrl`, `timeoutMs`, `maxRetries`, `maxRetryAfterMs`, `headers`, `fetch`. `client.as(identity)` returns a re-identified copy; `client.identity` reads the current one. Every call throws `ConfigurationError` without an identity.

- `identify(params?)` posts `POST /v1/client/identify` with `attributes`, `email`, `subscribe: { email? }`, `anonymousId` (to merge an anonymous browser identity). The client API merges attributes.
- `track(name, data?)` posts a `web`-sourced event; a `$` name is refused.
- `preferences()` returns `SubscriberPreference[]`: the full topic catalog with `channels: { push?: { optedIn, isDefault }, email?: … }` and each topic's `category`.
- `updatePreferences(changes)` takes `{ [slug]: boolean | { push?: boolean; email?: boolean } }`.

## `buzzkit/react`

```tsx
import { BuzzKitProvider, useBuzzKit, useIdentify, useIdentity, usePreferences, useTrack } from 'buzzkit/react';

export function App({ user }) {
  return (
    <BuzzKitProvider publishableKey='bk_pk_…' identity={{ externalId: user.id, identityHash: user.identityHash }}>
      <Settings />
    </BuzzKitProvider>
  );
}

function Settings() {
  const { data, error, isLoading, refresh, update } = usePreferences();
  if (isLoading || !data) return null;
  return data.map((topic) => (
    <label key={topic.slug}>
      <input
        type='checkbox'
        checked={topic.channels.push?.optedIn ?? false}
        onChange={(event) => update({ [topic.slug]: { push: event.target.checked } })}
      />
      {topic.name}
    </label>
  ));
}
```

- `BuzzKitProvider` takes the same options as `BuzzKitClient` plus `children`, and rebuilds the client only when a value changes.
- `useBuzzKit()` returns the client; `useIdentity()` the identity or `null`.
- `usePreferences()` loads on mount and returns `{ data, error, isLoading, refresh, update }`; `update` resolves to the new list and rethrows on failure so the caller can revert an optimistic toggle.
- `useIdentify(params?)` returns `{ data, error, isLoading, identify }`; call `identify()` on login or when attributes change.
- `useTrack()` returns `(name, data?) => Promise<void>`.

Group the preferences by `category` for sections, show a channel toggle per offered channel when more than one channel is connected, and identify before rendering so the list belongs to the real person.
