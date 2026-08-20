# Credentials

Provider credentials (APNs keys, FCM service accounts) — per tenant, encrypted at rest, validated on upload. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant: <slug>` (the default tenant when absent). Scopes: `credentials:read` / `credentials:write`.

## POST /v1/credentials/apns

```json
{ "p8": "-----BEGIN PRIVATE KEY-----…", "teamId": "ABCDE12345", "keyId": "XYZ9876543", "bundleId": "com.acme.app", "environment": "production" }
```

Validation on upload: the key is used to sign a real provider token and prove it against APNs (a request for an impossible device token — `BadDeviceToken` back means the credential works, nothing is delivered). Structurally invalid or provider-rejected keys are a 400 and nothing is stored. If APNs is unreachable (local dev on macOS), the credential stores as `unvalidated` — re-run with `POST /v1/credentials/:id/validate`.

Uploading again for the same (provider, environment) **replaces** the credential — one live credential per slot. → 201 `{ id: "crd_…", provider, environment, details, status, validatedAt, lastError, … }` — the secret never appears in any response.

## POST /v1/credentials/fcm

```json
{ "serviceAccount": { "project_id": "…", "client_email": "…", "private_key": "…" } }
```

Accepts the JSON object or its string form. Validated by requesting a real OAuth2 access token from Google. Environment is always `production`.

## GET /v1/credentials — list the tenant's credentials (masked)
## GET /v1/credentials/:id — retrieve one (masked)
## POST /v1/credentials/:id/validate — re-run validation, update status
## DELETE /v1/credentials/:id — revoke (soft delete)

## Encryption (industry-standard envelope encryption)

The KMS pattern (AWS KMS / Google Cloud KMS / Vault — the same scheme push platforms use for customer credentials):

- Each secret is sealed with its own single-use **AES-256-GCM data key (DEK)**; the DEK is sealed with the **master key** (`CREDENTIAL_MASTER_KEY`, a base64 32-byte Worker secret that never touches the database). Random 96-bit IVs per encryption; GCM provides authenticated encryption (tampered ciphertext fails to decrypt).
- **AAD context binding**: both encryptions carry `credential:v1:<tenantId>:push:<provider>:<environment>` as additional authenticated data — a ciphertext moved to another row, tenant, or environment refuses to decrypt.
- **Rotation**: bump the master key, re-wrap the tiny DEKs, bump `keyVersion` — payloads are never re-encrypted. Hosted deployments can later swap the Worker secret for a KMS-managed key without schema changes.
- Secrets decrypt only inside the validation/delivery path; no API response, log, or error ever contains one (test-enforced).
