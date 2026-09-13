# Workspaces, tenants and self-hosting

## Workspaces and tenants

A **workspace** holds the team, billing and API keys. A **tenant** inside it is the isolation boundary that owns subscribers, credentials, topics and sends; nothing crosses from one tenant to another. Every workspace is created with a tenant called `default` that cannot be deleted, and a single-app integration lives entirely in it and never sends the tenant header. Docs: `https://docs.buzzkit.dev/platform/tenants`.

Create a tenant per customer only when building a platform that sends on someone else's behalf, so each customer has their own Apple and Firebase keys, their own subscribers and their own topics. **A tenant is a customer of the person building on BuzzKit; it is not an app, a project or an environment.** The user's own separate apps are separate workspaces, not tenants.

```ts
await buzzkit.tenants.create({ name: 'Gymly', slug: 'gymly', metadata: { externalId: 'cus_123' } });
buzzkit.tenant('gymly').messages.send({ to: 'user_42', title: 'Leg day' });
```

The slug is the stable address for every tenant-scoped call (lowercase letters, digits, hyphens, unique in the workspace). `metadata` is free-form, the place for the user's own customer id. Creating a tenant also creates its `Default` client key. The default tenant's slug cannot change and it cannot be deleted; deleting any other tenant soft-deletes it and revokes its tenant keys.

**Selecting a tenant**: a workspace key (`bk_ws_`) implies its workspace; `BuzzKit-Tenant: <slug>` picks the tenant for a request (the SDK's `buzzkit.tenant(slug)`), the way a Stripe platform passes `Stripe-Account`. Omit it for `default`. A tenant key (`bk_tn_`) is locked to one tenant, needs no header, and is refused on workspace-level routes; reach for one when handing a customer or a semi-trusted subsystem direct access with a single tenant's blast radius.

## Tenant settings

`PATCH /v1/tenants/:slug` deep-merges a `settings` object per group; reads return the fully resolved object.

```ts
await buzzkit.tenants.update('gymly', {
  settings: {
    identity: { requireVerification: true },
    channels: { push: { enabled: true } },
    sendPolicy: { dailyCap: 10, quietHours: { from: '22:00', to: '08:00', timezone: 'subscriber' } },
  },
});
```

- `channels.<channel>.enabled` is a per-tenant kill switch, so a channel pauses without deleting its credential.
- `identity.requireVerification` makes the identity hash mandatory for every client call in the tenant.
- `sendPolicy.dailyCap` caps sent deliveries per subscriber per local day across everything; `sendPolicy.quietHours` defers a delivery to the next allowed local time (`timezone: "subscriber"` follows each person's `$timezone`, or a fixed IANA name). Both off by default. A topic's own `dailyCap` sits on top of the tenant cap; `policy: "ignore"` on a message bypasses the policy.

## The identity secret

Each tenant has an identity secret that closes the gap a client key leaves open (a client key in a binary lets any caller claim any `externalId`). The backend computes `identityHash = HMAC-SHA256(externalId, identitySecret)` as hex (`signIdentity` in the SDK) and hands it to the app at login; the app passes it on every client call. A valid hash marks the subscriber `verified` (with `identityVerifiedAt`, both on every read) whether or not enforcement is on; an invalid hash is always a 401. Turning on `identity.requireVerification` makes it mandatory.

The secret is never on the tenant object. It lives behind two session-only endpoints that require a dashboard admin: `GET /v1/tenants/:slug/identity-secret` (reveals it once for the backend's config) and `POST /v1/tenants/:slug/identity-secret/rotate` (replaces it; every hash minted with the old secret stops verifying). In the dashboard both are under Settings → Channels → Identity verification. API keys get a 403 on both, and `tenants:secrets` cannot be granted to a key at all. Read it into `BUZZKIT_IDENTITY_SECRET`; never ship it in the app.

Roll out verification safely: ship the hash from every client first, confirm subscribers show as verified, then enforce.

## Using a tenant as a sandbox

A second tenant is a clean sandbox: its subscribers, credentials, sends and workflows never mix with production, and an APNs key scoped to Apple's sandbox delivers to development builds only. Point the development build's client key and the staging backend's key at that tenant, and keep production in `default` (or its own tenant). Workflows also have `POST /v1/workflows/:slug/test` for a dry run, and segments have `POST /v1/segments/preview`.

## Self-hosting

A self-hosted deployment serves the same API at its own origin. Point `baseUrl` (SDK), `apiURL` (iOS) and every curl at that origin; nothing else changes, including the key formats. The core is AGPL-3.0 (API, dashboard, marketing, internal packages); the SDKs a customer embeds are MIT (the `buzzkit` server package and the iOS SDK), so shipping them in a closed-source app carries no copyleft obligation. A deployment needs a Cloudflare account (Workers, KV, Queues, Durable Objects, Hyperdrive), PostgreSQL and Tinybird; provider credentials are uploaded through the dashboard, not set as environment variables. A full self-hosting guide arrives when BuzzKit leaves beta; until then the repository README carries the current state (`https://github.com/buzzkit-dev/buzzkit`).
