# Best practices

Read this before writing the first line of a BuzzKit integration. Every rule here exists because the feature it protects (segments, workflows, personalization, preferences, safe retries) only works with data laid down correctly from the start. An integration that skips these works on day one and cannot do anything interesting on day thirty.

## 1. Identity: one id per person, and it is the user's own

- `externalId` is the id the user's backend already uses for the person (`user_42`, a UUID, an email if that is the primary key). The app's `identify`, the backend's `identify`, `to` on a send, `externalId` on an event and the `BuzzKit-Subscriber` header all carry that same value. There is no BuzzKit id to store.
- Never generate a BuzzKit-specific id, never store the `sub_…` id as the address, and never use a device id as the person id. A person has several devices; a device is a subscription, not a subscriber.
- Before login the iOS SDK runs under an anonymous id (`anon_…`) and merges it into the real id on the first `identify`, keeping the device, preferences, attributes and history. Let that happen: call `BuzzKit.identify(userId, …)` at login and on every launch where the user is already signed in. Call `BuzzKit.logout()` at sign-out so the next person on the phone does not receive the previous person's notifications.
- If the product already knows a user by an older or secondary id (a legacy scheme, an import from OneSignal, a provider's customer id), link it as an alias with `POST /v1/subscribers/:externalId/aliases { "externalId": "…" }` rather than creating a second subscriber. Every endpoint that takes an `externalId` then accepts either id.
- Identify from both sides. The app identifies with what the device knows (device context, push permission, app version arrive as `$` attributes on their own). The backend identifies with what only it knows (plan, billing state, roles, counts). `PUT /v1/subscribers/:externalId` is an idempotent upsert that answers `201` the first time and `200` after, so calling it on every login costs nothing and keeps the profile current.

## 2. Attributes: set everything that could ever matter

Attributes are the only thing segments can filter on and workflow branches can compare besides events. An attribute that was never set cannot be used, and backfilling later means re-identifying every user. So set generously from day one.

Set, at minimum, whatever the product has of these:

| Attribute | Why it matters later |
| --- | --- |
| `name`, `email` | Templates (`{{ subscriber.attributes.name }}`), the dashboard's subscriber list, email as a channel. `email` is also the subscriber's email address. |
| `plan`, `tier`, `trialEndsAt`, `subscriptionStatus` | Lifecycle campaigns, win-back, upgrade nudges, cancel-on-conversion. |
| `role`, `accountType`, `orgId`, `teamId`, `seats` | B2B targeting, per-account sends, admin-only notices. |
| `signupAt`, `firstPurchaseAt`, `lastOrderAt`, `ordersCount`, `lifetimeValue` | Cohorts, activation and retention workflows, VIP segments. |
| `locale`, `language`, `country` (when the backend knows better than the device) | Localized sends, regional campaigns. Note the SDK already stamps `$country`, `$city`, `$region`, `$language`, `$timezone` from the device; set your own keys when the backend's truth differs. |
| `onboardingStep`, `featureFlags`, `hasCompletedProfile`, `streak`, `level` | Product-state nudges: "finish setup", "you are close to a badge". |
| `marketingConsent`, `notificationPreferencesVersion` | Compliance and audit, without touching topics. |

Rules for attributes:

- **Names**: camelCase keys, stable forever, never renamed once in use (segments and workflows reference them by name). No `$` prefix; that namespace is BuzzKit's and a PUT carrying it is `400 system_attribute`.
- **Types**: numbers as numbers (`seats: 12`, not `"12"`), booleans as booleans, dates as ISO 8601 strings, enumerations as short lowercase strings (`plan: "pro"`). The comparator reads the value's type, so a stringified number never compares numerically.
- **Flat where possible**: nested objects work (`address.city` is addressable as `attributes.address.city`) but flat keys are easier to filter and template.
- **Size**: the serialized object is capped at 64 KB (`400 attributes_too_large`). Attributes are for facts about the person, not for logs or blobs.
- **Server replaces, client merges**: the backend's `PUT` replaces `attributes` wholesale when the field is present, so the backend must send the full set it owns every time. The app's `identify` merges, so the app may add keys without wiping the backend's. Decide which side owns which keys and keep it that way.
- **Timezone**: pass `timezone` (an IANA name) from the backend for users whose devices never call the client API, so subscriber-local scheduling and quiet hours work for them too. Devices set `$timezone` on their own.
- **Email**: `email` at the top level and `attributes.email` mean the same thing. Set it from day one even before an email provider is connected; pass `subscribe: { email: false }` to keep an address on file without subscribing it (an unverified address, for example).

## 3. Events: track the user's life in the product

Events are what workflows trigger on, what `waitFor` waits for, what `cancelOn` cancels on, what segments count (`{ "count": "workout.completed", "within": "7d", "gte": 3 }`) and what a subscriber's timeline shows. Track them from the side that knows the fact first.

Track at least:

- **Lifecycle**: `signup.completed`, `onboarding.completed`, `trial.started`, `trial.ended`, `subscription.started`, `subscription.renewed`, `subscription.canceled`, `account.deleted`.
- **Core value moments**, named for the product: `workout.completed`, `order.placed`, `document.shared`, `match.won`. These drive engagement workflows and the segments that separate active from lapsed users.
- **Funnel steps** the product cares about: `paywall.viewed`, `checkout.started`, `checkout.abandoned`, `invite.sent`, `invite.accepted`.
- **Anything a notification should react to or stop for**: if a workflow will nudge someone to finish X, track `x.completed` so the nudge can `cancelOn` it and the segment can exclude those who did.

Rules for events:

- **Names**: lowercase, dot-separated `object.action` (`cart.abandoned`), matching `[a-z0-9][a-z0-9_.-]{0,99}`, stable forever. Never `$`-prefixed (reserved, `400 reserved_event`).
- **Data**: a flat JSON object of the facts a workflow or segment would branch on (`{ "plan": "pro", "amount": 4900, "currency": "EUR" }`), at most 8 KB. Ids of related things (`orderId`, `workoutId`) belong here; whole records do not.
- **Ids for dedupe**: every event sent from a server carries an `id` that is unique per subscriber (`"order-1234-placed"`). A replay is answered as `duplicate` and stored once, so retrying a whole batch after a 429, a 5xx or a network failure is safe. Never retry other 4xx.
- **Timestamps**: pass `timestamp` when the event happened earlier than now (offline queues, batch imports); up to seven days back, one hour ahead.
- **From the app**: `BuzzKit.track(name, data:)` writes to disk first and flushes in batches, so track freely in view code. The SDK's own `$app.opened`, `$session.ended`, `$notification.opened`, `$notification.delivered`, `$permission.changed` and the rest arrive without any work and are as usable as custom events.
- **Batch from the backend**: up to 100 events per `POST /v1/events`; an unknown `externalId` creates the subscriber.

## 4. Preferences: any notification setting is a topic

If the app has, or will ever have, a notification settings screen, a "mute this kind of notification" switch, or a marketing opt-in, it is built on topics. Never a column on the user table, never a custom preferences endpoint, never a boolean on the subscriber's attributes.

- Create one topic per kind of notification a person could reasonably want to turn off separately: `order-updates`, `gym-reminders`, `friend-activity`, `marketing`, `digest`. Group them with `category` (`"Orders"`, `"Training"`, `"Social"`) so the settings screen has sections.
- Set `defaultOptedIn` honestly: transactional and safety topics default on, marketing defaults to whatever the law where the user lives requires. A `dailyCap` on a chatty topic keeps it from burning the person out.
- Every send names its `topic`. A send without a topic ignores preferences entirely, which is right only for the security-alert class of message; those also carry `policy: "ignore"` to bypass quiet hours.
- The settings screen is `BuzzKitPreferencesView` from `BuzzKitUI` on iOS, `usePreferences` from `buzzkit/react` on the web, or `GET`/`PATCH /v1/client/preferences` by hand. All of them return the full catalog with the resolved state per channel, so adding a topic in the dashboard changes the screen with no app release.
- Identify before showing the screen, so preferences belong to the real person and work even when push permission was denied.
- Preferences are per topic and per channel: someone can keep a topic on push and off email. The UI should show channels when more than one is connected.

## 5. Sending: idempotent, addressed, verified

- Pass a meaningful `idempotencyKey` on every send from server code: `order-${orderId}-shipped`, `digest-${userId}-${date}`. The SDK generates a random one when you do not, which protects a single retried call, but a meaningful key protects against the same business event being sent twice from two places. The same key with a different body is `409 idempotency_key_reused`, which is the guard working.
- Address people by `to: externalId`, topics by `topic`, cohorts by `segment` or `where`. `to`, `segment` and `where` are mutually exclusive; `topic` combines with any of them as a filter.
- Every message that opens something carries `deepLink` and every message that should do something in the app carries `action: { name, data }`, with handlers registered in the app at launch. That is what lets the dashboard change what a campaign does without an app release.
- Keep `title` short, put the substance in `body`, put machine data in `data` (delivered exactly as sent, at the payload root on iOS).
- `202` means accepted, not delivered. To know what happened, read the message's `counts`, then the deliveries by `status`, then one delivery's attempts. `counts.total: 0` means nobody was reachable: no subscription on that channel, or the topic opted out.
- Schedule in the subscriber's own clock for anything that should land at a time of day: `"schedule": { "at": "2026-09-04T09:00", "timezone": "subscriber", "defaultTimezone": "UTC" }`. Anything recurring or reactive is a workflow, not a scheduled send.
- Set `ttlSeconds` on time-bound content (a flash sale, a "starting now") so a phone that was off does not get it tomorrow.

## 6. Verification and secrets

- The client key alone lets any caller claim any id. Sign `identityHash = HMAC-SHA256(externalId, identitySecret)` (hex) on the backend at login (`signIdentity` in the SDK), hand it to the app with the session, pass it to `BuzzKit.identify(…, identityHash:)` or `identity: { externalId, identityHash }` in the browser. Once every client sends it, turn on `identity.requireVerification` in the tenant settings.
- `bk_ws_` and `bk_tn_` keys and the identity secret live in environment variables on the server (`BUZZKIT_API_KEY`, `BUZZKIT_IDENTITY_SECRET`, `BUZZKIT_WEBHOOK_SECRET`). They never appear in client code, mobile bundles, logs, commits or example files with real values. `bk_pk_` is the only key meant to ship.
- Rotate by creating the replacement first, moving the backend over, then revoking the old key in the dashboard.
- Webhook receivers verify the exact raw bytes with `verifyWebhook` before parsing, dedupe on the event `id`, and never assume ordering.

## 7. Environments

- Use a second tenant as the sandbox: its subscribers, credentials, sends and workflows never mix with production, and an APNs key scoped to Apple's sandbox delivers to development builds only. Point the development build's client key and the staging backend's key at that tenant.
- Debug builds register as `sandbox`; the SDK reads the environment from the provisioning profile, or force it with `pushEnvironment`.
- Test workflows with `POST /v1/workflows/:slug/test` (no sends, no writes) before `publish`, and preview segments with `POST /v1/segments/preview` before a big send.

## 8. Errors, retries and reads

- Branch on `error.code`, never the message. Retry only `429`, `5xx`, timeouts and connection failures, and only for requests that are safe to repeat: GET, PUT, DELETE, or a POST carrying an idempotency key or event ids. Honor `Retry-After`; the SDK does and throws with `retryAfterSeconds` when the wait is longer than `maxRetryAfterMs`, so queue the work instead of blocking a request.
- After every write, read back: the subscriber after identify, the message after send, the run after a trigger. Do not report success from the write's status alone.
- Reads over the event stream (`/v1/events`, timelines) trail writes by a few seconds and paginate by cursor with no `total`. Do not poll them in a tight loop expecting instant consistency.

## 9. What to build first for a typical app

1. Identify with a full attribute set on both sides, sign the identity hash, register for push on the moment the user would care about notifications (not blindly on first launch; consider `registerForPush(provisional: true)` to earn the prompt later).
2. Register the app's named actions (`open_paywall`, `open_screen`, `start_workout`) and a deep link handler, so every later notification can route without a release.
3. Track lifecycle and core-value events.
4. Create topics for every distinct kind of notification and ship the preferences screen.
5. Send transactional messages from the backend with meaningful idempotency keys and a `topic` each.
6. Add a workflow per lifecycle moment (onboarding nudge with `cancelOn` completion, trial ending, win-back after `lastSeen` older than 30 days), dry-run each, then publish.
7. Add sources for the billing provider so `subscription.*` events arrive without backend code, and a webhook endpoint if the backend needs to react to deliveries or runs.

## 10. What not to do

- Do not build a preferences table, a notification log or a device token table of your own; BuzzKit is the system of record for all three.
- Do not send to a topic or segment, publish a workflow, or send in a production tenant without the user's say-so.
- Do not use a device token, an email or a random UUID as the subscriber id when the backend has a user id.
- Do not put secrets in `attributes`, event `data` or message `data`; all three are readable by the subscriber's own client.
- Do not retry a `400`; the request is malformed and will fail again.
- Do not claim delivery from a `202`, and do not describe features, fields or limits that are not in this skill or the docs.
