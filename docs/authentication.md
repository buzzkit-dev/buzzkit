# Authentication & Authorization

## Credentials

| Credential | Prefix | Obtained | Powers |
|---|---|---|---|
| **Session** (bearer token) | — | BetterAuth (`/v1/auth/*`, email + password) | Dashboard use: everything the user's workspace role allows, plus account routes and key management |
| **Workspace API key** | `bk_ws_` | Dashboard → `/v1/workspaces/:slug/keys` | Server-side: any granted scope across ALL tenants of its workspace — this is the key the product promise runs on |
| **Tenant API key** | `bk_tn_` | Same, with `kind: "tenant"` + tenant slug | Locked to one tenant's data plane (devices, sends — from Phase 3/4). Rejected on all workspace-context routes |
| **Client key** | `bk_pk_` | *Phase 3* | Embed-safe: device registration + subscriber identify only |

Secrets are stored as SHA-256 hashes (of the post-prefix portion) and shown exactly once at creation. `Authorization: Bearer <secret>` everywhere.

## Workspace addressing

- `/v1/workspaces/:slug/*` — the slug is in the path.
- `/v1/tenants*` (and future data-plane routes) — an API key implies its own workspace; dashboard sessions pass `x-workspace: <slug>` instead.
- A key used against a slug it doesn't belong to is a 403 — always.

## Scopes

Every route declares exactly one scope; the scope's context decides authentication (catalog in `apps/api/src/libs/scopes.ts`):

- **user context** (`account:read|write`) — session-only.
- **workspace context** (everything else in Phase 1) — session membership (scopes from the role bundle) or workspace API key (scopes from its grants; wildcards `*` / `resource:*` supported).

Role bundles: `member` → read scopes + members:read; `admin` → + workspace:write, members:write, invites:*, tenants:write, keys:*; `owner` → + workspace:delete.

**Session-only scopes:** `keys:read` / `keys:write` — an API key can never mint, list, or revoke keys, even with a `*` grant. A leaked key must never escalate.

## Invariants (enforced by `test/v1/auth/index.test.ts` — the isolation matrix)

1. No route touches workspace or tenant data without a resolved, authorized workspace context.
2. Tenant keys never satisfy workspace-context scopes.
3. Keys never manage keys.
4. Cross-workspace addressing fails closed (403), invalid/revoked/expired credentials fail closed (401).
5. Sessions are cached in KV for 5 minutes (`SESSION_CACHE`); API keys are verified against the database on every request.
