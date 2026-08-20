# Client API

`/v1/client/*` is the surface the mobile app itself talks to, authenticated by an embed-safe **client key** (`bk_pk_…`, minted with `kind: "client"` + a tenant; fixed capabilities, no scopes, safe to ship in the app binary). Only client keys work here, and client keys work nowhere else. The goal: buzzkit is the ONLY thing the app needs for notifications — registration and a full notification-settings screen with zero backend code.

## POST /v1/client/identify

`{ externalId, email?, identityHash? }` — creates the subscriber if new (`email` upserts an email subscription). Call at login (or before showing preferences, so they work even if push permission was denied).

## POST /v1/client/subscriptions

`{ externalId, channel: "push", platform, token, identityHash? }` — register/refresh the push subscription. Same idempotent semantics as the server-side endpoint. Call on every app launch after obtaining the token.

## PATCH /v1/client/subscriptions

`{ channel, platform?, token?|address?, enabled }` — the in-app "notifications on this device" toggle: mutes ONE subscription, everything else keeps receiving.

## DELETE /v1/client/subscriptions

`{ channel, platform?, token?|address? }` — unregister on logout.

## GET / PATCH /v1/client/preferences

Headers: `BuzzKit-Subscriber: <externalId>` (+ `BuzzKit-Identity: <hash>` when enforcement is on). GET returns the resolved topic list ([topics.md](topics.md)); PATCH takes `{ "preferences": { "gym-reminders": false } }`. This pair IS the notification-settings screen.

## Identity verification (recommended for production)

A public key alone lets any caller claim any `externalId`. Your backend computes `identityHash = HMAC-SHA256(externalId, identitySecret)` (hex; the secret is on the tenant object, server-side only — never ship it in the app) and hands it to the app at login.

- **Always allowed**: a valid hash on any client call stamps the subscriber `verified` (`identityVerifiedAt`) — visible on every subscriber read, so anonymous and verified users coexist and you can see which is which. An invalid hash is always a 401, enforced or not.
- **Enforced** (`PATCH /v1/tenants/:slug { "settings": { "identity": { "requireVerification": true } } }`): every client call must carry a valid hash. A stolen hash only ever impersonates the one user it was minted for. Verified with constant-time comparison.
