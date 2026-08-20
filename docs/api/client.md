# Client API

`/v1/client/*` is the surface the mobile app itself talks to, authenticated by an embed-safe **client key** (`bk_pk_…`, minted with `kind: "client"` + a tenant; fixed capabilities, no scopes, safe to ship in the app binary). Only client keys work here, and client keys work nowhere else. The goal: buzzkit is the ONLY thing the app needs for notifications — registration and a full notification-settings screen with zero backend code.

## POST /v1/client/identify

`{ externalId, identityHash? }` — creates the subscriber if new. Call at login (or before showing preferences, so they work even if push permission was denied).

## POST /v1/client/devices

`{ externalId, platform, token, identityHash? }` — register/refresh the push token. Same idempotent semantics as the server-side endpoint. Call on every app launch after obtaining the token.

## DELETE /v1/client/devices

`{ token }` — unregister on logout.

## GET / PATCH /v1/client/preferences

Headers: `BuzzKit-Subscriber: <externalId>` (+ `BuzzKit-Identity: <hash>` when enforcement is on). GET returns the resolved topic list ([topics.md](topics.md)); PATCH takes `{ "preferences": { "gym-reminders": false } }`. This pair IS the notification-settings screen.

## Identity verification (recommended for production)

A public key alone lets any caller claim any `externalId`. To close that, enable per tenant: `PATCH /v1/tenants/:slug { "requireIdentityVerification": true }`. Your backend then computes `identityHash = HMAC-SHA256(externalId, identitySecret)` (hex; the secret is on the tenant object, server-side only — never ship it in the app) and hands it to the app at login. With enforcement on, every client call must carry a valid hash for its externalId — a stolen hash only ever impersonates the one user it was minted for. Verified with constant-time comparison.
