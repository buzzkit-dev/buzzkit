# Webhooks API

Endpoint management for [webhook delivery](../webhooks.md). Workspace-context routes: `webhooks:read` is member-level, `webhooks:write` admin; both are key-grantable so provisioning tooling can manage endpoints. Tenant keys are refused (an endpoint can filter on a tenant, but it belongs to the workspace).

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/workspaces/:slug/webhooks` | `webhooks:read` | Endpoints, secrets masked |
| POST | `/v1/workspaces/:slug/webhooks` | `webhooks:write` | `{ url, description?, events?, tenant? }` → 201 with the secret. `events` empty/omitted = every public event; entries are exact names, `resource.*`, `*`, or your own event names (`order.*`); at most 50 endpoints per workspace |
| GET | `/v1/workspaces/:slug/webhooks/catalog` | `webhooks:read` | The subscribable buzzkit events, grouped by resource, for pickers (`{ groups: [{ label, wildcard?, options }] }`; a group of one dotless name such as `$identify` has no wildcard) |
| GET | `/v1/workspaces/:slug/webhooks/events/:id` | `webhooks:read` | One event object (`whe_…`), the exact payload that was signed |
| GET | `/v1/workspaces/:slug/webhooks/:id` | `webhooks:read` | With `secret` (and `previousSecret` while a rotation overlaps) |
| PATCH | `/v1/workspaces/:slug/webhooks/:id` | `webhooks:write` | `{ url?, description?, events?, tenant? (slug or null), enabled? }`; `enabled: true` clears a failure streak and an auto-disable and re-enqueues the endpoint's pending and failed deliveries (newest 500) at once |
| DELETE | `/v1/workspaces/:slug/webhooks/:id` | `webhooks:write` | Soft delete; deliveries stop at once |
| POST | `/v1/workspaces/:slug/webhooks/:id/rotate` | `webhooks:write` | New `whsec_`; the old one keeps verifying for 24 hours |
| GET | `/v1/workspaces/:slug/webhooks/:id/deliveries` | `webhooks:read` | Paged newest first with `total`; `?status=pending\|success\|failed\|exhausted` |
| GET | `/v1/workspaces/:slug/webhooks/:id/deliveries/:deliveryId` | `webhooks:read` | The delivery with every attempt and the event |
| POST | `/v1/workspaces/:slug/webhooks/:id/deliveries/:deliveryId/replay` | `webhooks:write` | 202; re-sends the stored payload as one more attempt; 400 `endpoint_disabled` while the endpoint is disabled |

Endpoint: `{ id: "whk_…", tenantId, url, description, events[], enabled, disabledAt, disabledReason, failingSince, secret?, previousSecret?, previousSecretExpiresAt?, createdAt, updatedAt }`. Delivery: `{ id: "whd_…", endpointId, eventId, eventType, status, attempts, nextAttemptAt, lastStatus, lastError, lastAttemptAt, createdAt }`; attempt: `{ id: "wha_…", attempt, status, error, durationMs, responseBody, createdAt }`.

Errors: `invalid_url` (`url`: not http(s), carries credentials, or, in production, not https or not public: localhost, `.local` / `.internal`, loopback, RFC 1918, link-local, CGNAT and IPv4-mapped IPv6 literals; a hostname that merely resolves to a private address cannot be caught from a Worker), `invalid_event` (`events`: unknown pattern, a `$` name buzzkit never emits, a private audit name or pattern such as `key.*`, or a malformed custom name), `endpoint_limit`, `endpoint_disabled`.

Management actions are audit entries (`webhook.created / updated / deleted / secret_rotated / replayed`, and `webhook.disabled` by the system), never webhook events themselves.
