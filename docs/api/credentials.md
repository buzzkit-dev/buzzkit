# Credentials

Provider credentials (APNs keys, FCM service accounts) — per tenant, encrypted at rest, validated on upload. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant: <slug>` (the default tenant when absent). Scopes: `credentials:read` / `credentials:write`.

## POST /v1/credentials

One endpoint, discriminated by `provider` (Stripe's `type` pattern) — the registry maps provider → channel, validates the upload with a real provider call, and replaces the live slot for (tenant, channel, provider, environment):

- `{ "provider": "apns", "p8", "teamId", "keyId", "bundleId", "environment"?: "production" | "sandbox" }` — push via APNs token auth.
- `{ "provider": "fcm", "serviceAccount": <JSON string or object> }` — push via FCM HTTP v1 (`project_id`, `client_email`, `private_key` required; `invalid_service_account` otherwise).
- `{ "provider": "resend", "apiKey" }` — email via Resend.

Returns 201 with the masked credential (`status` is `active`, `unvalidated` when the provider could not be reached, or the request is a 400 when the provider rejected the key). `tenant: credentials:write`.

## GET /v1/credentials — list the tenant's credentials (masked)
## GET /v1/credentials/:id — retrieve one (masked)
## POST /v1/credentials/:id/validate — re-run validation, update status
## DELETE /v1/credentials/:id — revoke (soft delete)

## Provider registry

Every provider is one self-contained module in `apps/api/src/providers/<name>/` plus one entry in the registry (`providers/index.ts`: channel, display name, `validate()`). The credentials domain is fully generic — one `validateCredentialUpload()` for all providers, one lifecycle, one storage shape (sealed secret + `details` JSONB). Adding a provider = provider module + registry entry + one thin upload route. No per-provider logic ever accumulates in the domain.

## Encryption (industry-standard envelope encryption)

The KMS pattern (AWS KMS / Google Cloud KMS / Vault — the same scheme push platforms use for customer credentials):

- Each secret is sealed with its own single-use **AES-256-GCM data key (DEK)**; the DEK is sealed with the **master key** (`CREDENTIAL_MASTER_KEY`, a base64 32-byte Worker secret that never touches the database). Random 96-bit IVs per encryption; GCM provides authenticated encryption (tampered ciphertext fails to decrypt).
- **AAD context binding**: both encryptions carry `credential:v1:<tenantId>:push:<provider>:<environment>` as additional authenticated data — a ciphertext moved to another row, tenant, or environment refuses to decrypt.
- **Rotation**: bump the master key, re-wrap the tiny DEKs, bump `keyVersion` — payloads are never re-encrypted. Hosted deployments can later swap the Worker secret for a KMS-managed key without schema changes.
- Secrets decrypt only inside the validation/delivery path; no API response, log, or error ever contains one (test-enforced).
