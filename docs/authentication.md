# Authentication & Authorization

## Credentials

| Credential | Prefix | Obtained | Powers |
|---|---|---|---|
| **Session** (bearer token) | — | BetterAuth (`/v1/auth/*`, email + password) | Dashboard use: everything the user's workspace role allows, plus account routes and key management |
| **Workspace API key** | `bk_ws_` | Dashboard → `/v1/workspaces/:slug/keys` | **The one key you store.** Server-side: any granted scope across ALL tenants of its workspace, tenant addressed per request — this is the key the product promise runs on |
| **Tenant API key** | `bk_tn_` | Same, with `kind: "tenant"` + tenant slug | *Optional* — the restricted-key analog (Stripe `rk_`): locked to one tenant's data plane, for handing a customer or semi-trusted subsystem direct access with a one-tenant blast radius. Never required; rejected on all workspace-context routes |
| **Client key** | `bk_pk_` | Same, with `kind: "client"` + tenant (no scopes) | Embed-safe, ships in the app binary: `/v1/client/*` only — identify, device register/unregister, own preferences. Optional per-tenant HMAC identity verification stops externalId spoofing |

Secrets are stored as SHA-256 hashes (of the post-prefix portion) and shown exactly once at creation. `Authorization: Bearer <secret>` everywhere.

## Addressing

- `/v1/workspaces/:slug/*` — the workspace slug is in the path.
- Slug-less routes (`/v1/tenants*`, `/v1/credentials*`, all future data-plane routes) — an API key implies its own workspace; dashboard sessions pass `buzzkit-workspace: <slug>` instead.
- **Tenant selection (data plane)** — the Stripe-Account pattern, and the PRIMARY multi-tenant flow: a platform stores exactly one workspace key and passes `buzzkit-tenant: <slug>` per request (Stripe platforms do the identical thing — one platform secret key + `Stripe-Account: acct_…`; Stripe issues no per-connected-account keys). The **default tenant** is used when the header is absent — the simple case needs no tenant awareness at all. Tenant keys, when used, imply their tenant and need no header.
- A key used against a slug or tenant it doesn't belong to is a 403 — always.

## Scopes

Every route declares exactly one scope; the scope's context decides authentication (catalog in `apps/api/src/libs/scopes.ts`):

- **user context** (`account:read|write`) — session-only.
- **workspace context** (control plane) — session membership (scopes from the role bundle) or workspace API key (scopes from its grants; wildcards `*` / `resource:*` supported). Tenant keys are rejected.
- **tenant context** (data plane: `credentials:*`, `subscribers:*`, `devices:*`, `topics:*`, later messages) — additionally accepts tenant keys; the tenant resolves per the addressing rules above. Tenant keys can only ever be granted tenant-context scopes.
- **client context** (`/v1/client/*`) — client keys ONLY (secret keys and sessions are refused); the key implies workspace + tenant. Subscriber identity comes from the request (`externalId` in bodies, `BuzzKit-Subscriber` header on preferences), optionally proven by `identityHash` / `BuzzKit-Identity` (HMAC-SHA256 of the externalId with the tenant's identity secret) when the tenant enforces verification.

Role bundles: `member` → read scopes + members:read; `admin` → + workspace:write, members:write, invites:*, tenants:write, keys:*; `owner` → + workspace:delete.

**Session-only scopes:** `keys:read` / `keys:write` — an API key can never mint, list, or revoke keys, even with a `*` grant. A leaked key must never escalate.

## Invariants (enforced by `test/v1/auth/index.test.ts` — the isolation matrix)

1. No route touches workspace or tenant data without a resolved, authorized workspace context.
2. Tenant keys never satisfy workspace-context scopes.
3. Keys never manage keys.
3b. Ownership is owner-only: granting or revoking the `owner` role requires owner-level authority, so `members:write` alone can never escalate.
4. Cross-workspace addressing fails closed (403), invalid/revoked/expired credentials fail closed (401).
5. Sessions are cached in KV for 5 minutes (`SESSION_CACHE`) and the cache entry is purged on sign-out, so sign-out revokes access immediately; API keys are verified against the database on every request.
