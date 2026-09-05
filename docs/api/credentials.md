# Credentials

Provider credentials (APNs keys, FCM service accounts) — per tenant, encrypted at rest, validated on upload. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant: <slug>` (the default tenant when absent). Scopes: `credentials:read` / `credentials:write`.

## POST /v1/credentials

One endpoint, discriminated by `provider` (Stripe's `type` pattern) — the registry maps provider → channel, validates the upload with a real provider call, and replaces the live slot for (tenant, channel, provider, environment):

- `{ "provider": "apns", "p8", "teamId", "keyId", "bundleId", "environment"? }` — push via APNs token auth. **Omit `environment` and we detect it**: the key is probed against both APNs hosts and one credential is created per environment it is valid for (Apple's portal can scope a key to Sandbox, Production, or both — since February 2025 Apple recommends environment-specific keys; the detection makes either choice work without a selector). Pass `environment` to fill exactly one slot. The response is a list of the created credentials.
- `{ "provider": "fcm", "serviceAccount": <JSON string or object> }` — push via FCM HTTP v1 (`project_id`, `client_email`, `private_key` required; `invalid_service_account` otherwise).
- `{ "provider": "resend", "apiKey" }` — email via Resend.

Returns 201 with the masked credentials (`status` is `active`, `unvalidated` when the provider could not be reached, or the request is a 400 `credential_rejected` when the provider rejected the key — for APNs that includes a key that is valid for neither environment, a swapped Team/Key ID, or a topic-specific key for another bundle). `tenant: credentials:write`.

**Recommended onboarding copy:** *Create one key in the Apple Developer portal: Keys → + → Apple Push Notifications service (APNs) → Environment: Sandbox & Production → Key Restriction: Team Scoped (All Topics). Download the `.p8` and paste it here with your Team ID, Key ID and bundle ID. If your team keeps separate Sandbox and Production keys, add each one — we detect which is which.* The dashboard shows the detected environments next to the key and nudges towards covering both; the API never rejects a single-environment key.

**Which slot a send uses is decided by the device, not the sender.** A push subscription carries `environment` (`production` by default; the app sends `sandbox` for debug builds), and delivery picks the credential for that environment. A device whose environment has no credential fails as `no_credential` naming the environment. `BadEnvironmentKeyInToken` (a key in the wrong slot) is a terminal `invalid_credential`.

## GET /v1/credentials — list the tenant's credentials (masked)
## GET /v1/credentials/:id — retrieve one (masked)
## POST /v1/credentials/:id/validate — re-run validation, update status
## DELETE /v1/credentials/:id — revoke (soft delete)

## Provider registry

Every provider is one self-contained module in `apps/api/src/providers/<name>/` plus one entry in the registry (`providers/index.ts`: channel, display name, `validate()`). The credentials domain is fully generic — one `validateCredentialUpload()` for all providers, one lifecycle, one storage shape (sealed secret + `details` JSONB). Adding a provider = provider module + registry entry + one thin upload route. No per-provider logic ever accumulates in the domain.

## Encryption (industry-standard envelope encryption)

The KMS pattern (AWS KMS / Google Cloud KMS / Vault — the same scheme push platforms use for customer credentials):

- Each secret is sealed with its own single-use **AES-256-GCM data key (DEK)**; the DEK is wrapped with the **master key** (`CREDENTIAL_MASTER_KEY_V<n>`, base64 32-byte Worker secrets that never touch the database). Random 96-bit IVs per encryption; GCM provides authenticated encryption (tampered ciphertext fails to decrypt).
- **AAD context binding**: the payload encryption carries `credential:v1:<tenantId>:push:<provider>:<environment>` as additional authenticated data, the DEK wrap carries the same plus `:k<keyVersion>` — a ciphertext moved to another row, tenant or environment refuses to decrypt, and so does a row whose recorded key version was tampered with.
- **Rotation**: master keys are versioned secrets (`_V1`, `_V2`, …, contiguous, the highest is current). New uploads wrap under the current version; `keyVersion` on the row says which key wraps its DEK. The scheduler's re-wrap sweep (`queue/rewrap.ts`, 200 rows per run) unwraps older DEKs and re-wraps them under the current key, never touching the payload ciphertext, with an optimistic `keyVersion` check so a concurrent upload is never overwritten. Once no row references an old version it can be deleted. Unit-tested in `test/libs/crypto.test.ts`.
- Secrets decrypt only inside the validation/delivery path; no API response, log, or error ever contains one (test-enforced).

## A channel exists only once it is connected

A tenant's **connected channels** are the channels it holds a live (not deleted) credential for, whatever the credential's validation status. Nothing channel-specific can be created for a channel that is not connected: `POST` / `PATCH /v1/topics` (`channels`), `POST /v1/subscriptions`, the client `subscriptions` route, and `POST /v1/messages` all answer 400 `channel_not_connected` (`param` names the field) until a credential for that channel exists. The subscriber's email (`email` or `attributes.email` on `PUT /v1/subscribers/:externalId`, the client `identify` route and `POST /v1/imports`) is the one exception: the address is profile data first, and the email subscription it also registers is simply left out while email is not connected (or when the call says `subscribe: { email: false }`), so a backend can set every subscriber's address before an email provider exists. A topic created without `channels` gets the connected channels.

Removing a credential is not destructive: topics keep their `channels` and subscriptions keep their endpoints, so re-connecting the channel brings them back without anyone re-registering. In between, sends and new registrations on that channel are refused, and the dashboard hides the channel everywhere except where a record still carries it.
