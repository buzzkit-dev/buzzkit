# Client API

`/v1/client/*` is the surface the mobile app itself talks to, authenticated by an embed-safe **client key** (`bk_pk_…`, minted with `kind: "client"` + a tenant; fixed capabilities, no scopes, safe to ship in the app binary). Only client keys work here, and client keys work nowhere else. The goal: buzzkit is the ONLY thing the app needs for notifications — registration and a full notification-settings screen with zero backend code.

## POST /v1/client/identify

`{ externalId, email?, identityHash? }` — creates the subscriber if new (`email` upserts an email subscription). Call at login (or before showing preferences, so they work even if push permission was denied).

## POST /v1/client/subscriptions

`{ externalId, channel: "push", platform, token, environment?, identityHash? }` (`environment: "sandbox"` from debug builds) — register/refresh the push subscription. Same idempotent semantics as the server-side endpoint. Call on every app launch after obtaining the token.

## PATCH /v1/client/subscriptions/:id

Headers: `BuzzKit-Subscriber: <externalId>` (+ `BuzzKit-Identity: <hash>` when enforcement is on). Body `{ enabled }`. Mutes or unmutes the caller's own subscription (the id comes back from the registration call); a subscription bound to anyone else is a 404, never a hint.

## DELETE /v1/client/subscriptions/:id

Same headers; unregisters the caller's own subscription and returns it with `deleted: true`.

## GET / PATCH /v1/client/preferences

Headers: `BuzzKit-Subscriber: <externalId>` (+ `BuzzKit-Identity: <hash>` when enforcement is on). GET returns the resolved topic list ([topics.md](topics.md)); PATCH takes `{ "preferences": { "gym-reminders": false } }`. This pair IS the notification-settings screen.

## Identity verification (recommended for production)

A public key alone lets any caller claim any `externalId`. Your backend computes `identityHash = HMAC-SHA256(externalId, identitySecret)` (hex; fetch the secret once from the session-only `GET /v1/tenants/:slug/identity-secret`, keep it server-side — never ship it in the app; rotate it with `POST …/identity-secret/rotate`, which invalidates every outstanding hash) and hands it to the app at login.

- **Always allowed**: a valid hash on any client call stamps the subscriber `verified` (`identityVerifiedAt`) — visible on every subscriber read, so anonymous and verified users coexist and you can see which is which. An invalid hash is always a 401, enforced or not.
- **Enforced** (`PATCH /v1/tenants/:slug { "settings": { "identity": { "requireVerification": true } } }`): every client call must carry a valid hash. A stolen hash only ever impersonates the one user it was minted for. Verified with constant-time comparison.

**Endpoint ownership without verification.** With verification off, any caller can claim any `externalId` — that is inherent to an unverified public key (OneSignal has the same trade-off). What the API still refuses from an *unverified* client call is moving an endpoint that already belongs to another subscriber: re-registering someone else's push token or email under a new `externalId` is a 409, and PATCH/DELETE only act on the caller's own binding. A call carrying a valid `identityHash` may move the endpoint (the user proved who they are), and server-side routes (secret keys) always can. New endpoints bind freely, so an attacker can still register their own device under a victim's id while verification is off — enable verification before you send anything sensitive.
