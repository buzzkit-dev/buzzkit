# Configuration

Every variable, secret and binding the two Workers read, what it is for, and whether a self-hoster needs it. Non-secret values live in each app's `wrangler.jsonc` (`vars`) and are overridden per environment at deploy time; secrets live in `.dev.vars` locally (git-ignored; copy from `.dev.vars.example`) and in `wrangler secret put` when deployed. After adding a secret locally, run `bun run cf-typegen` in that app so `worker-configuration.d.ts` knows about it.

**Self-hosting needs only the "required" rows.** Everything marked optional exists for the hosted product or for conveniences a private deployment can do without; leaving it unset turns the feature off cleanly rather than breaking anything.

## `apps/api`

### Variables (`wrangler.jsonc` → `vars`)

| Name | Required | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | yes | `development` or `production`. Relaxes BetterAuth's CSRF check and exposes the OpenAPI reference in development only. |
| `DASHBOARD_URL` | yes | Origin of the dashboard (`http://localhost:5180` locally). It is the CORS origin, a BetterAuth trusted origin, and where GitHub sign-in hands the browser back to. |
| `TRACE_SAMPLE_RATIO` | optional | Head-sampling ratio for traces, `0` to `1` (default `1`). Error traces are always kept. |

### Secrets (`.dev.vars` locally, `wrangler secret put` deployed)

| Name | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_URL` | yes | The public address of BetterAuth: this API's origin plus `/v1/auth` (`http://localhost:8790/v1/auth` locally, `https://api.example.com/v1/auth` deployed). OAuth callback URLs are built from it: the GitHub OAuth app's callback URL is `<BETTER_AUTH_URL>/callback/github`. |
| `BETTER_AUTH_SECRET` | yes | Signs sessions and tokens. Any 32+ byte random string (`openssl rand -base64 32`). Rotating it signs everyone out. |
| `CREDENTIAL_MASTER_KEY_V1`, `_V2`, … | yes (v1) | Master keys that wrap each credential's data key, 32 random bytes base64 each (`openssl rand -base64 32`). The highest contiguous version is current: new uploads seal under it and the scheduler re-wraps older rows to it, so rotation is "add `_V<n+1>`, deploy, wait for the sweep, delete `_V<n>`". Losing every version that still wraps a row means re-uploading that credential. |
| `SQIDS_ALPHABET` | yes | Shuffled alphabet (all 62 of `0-9a-zA-Z`, random order) for public ids so they are not enumerable. Generate one per deployment and never change it: ids are derived from it. |
| `GITHUB_CLIENT_ID` | optional | GitHub OAuth app id. Together with the secret it turns on "Sign in with GitHub" (the dashboard also needs the id to show the button). Email + password is always available, so a self-hosted deployment does not need this. |
| `GITHUB_CLIENT_SECRET` | optional | GitHub OAuth app secret. See above. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | Where traces go (`bun jaeger` then `http://localhost:4318` locally). Wins over Axiom when set; traces are dropped when neither is configured. |
| `AXIOM_API_TOKEN` | optional | Axiom token for logs and traces. Logs always print to the console as well. |
| `AXIOM_LOGS_DATASET` | optional | Axiom dataset for logs. |
| `AXIOM_TRACES_DATASET` | optional | Axiom dataset for traces, used when no OTLP endpoint is set. |

### Bindings (`wrangler.jsonc`)

| Binding | Required | Purpose |
| --- | --- | --- |
| `HYPERDRIVE` | yes | PostgreSQL connection (Hyperdrive in production, `localConnectionString` locally). |
| `AUTH_CACHE` (KV) | yes | Resolved dashboard sessions (5 minutes) and API keys (60 seconds, purged on revoke). |
| `PROVIDER_CACHE` (KV) | yes | Short-lived provider tokens (APNs JWTs, FCM OAuth tokens). |
| `DELIVERIES` (Queue) | yes | Queue-backed message delivery with per-attempt leases. |
| `EMAIL` (Email Sending) | yes for invites | Sends invite email from `mail@tm.buzzkit.dev` (hardcoded in `libs/email.ts`; the domain must be onboarded to Cloudflare Email Sending). `remote: true` means real email even in local dev. |

## `apps/web`

| Name | Kind | Required | Purpose |
| --- | --- | --- | --- |
| `ENVIRONMENT` | var | yes | `development` or `production`. Controls the `Secure` flag on the session cookie. |
| `API_URL` | var | yes | Origin of the API this dashboard talks to (`http://localhost:8790` locally). Every `/v1/*` call goes there, and the browser signs in against its `/v1/auth` directly. The dashboard has no secrets of its own. |
| `GITHUB_CLIENT_ID` | var | optional | The GitHub OAuth app's public client id, the same one the API has. Its presence shows the "Sign in with GitHub" button; the API runs the flow. |
| `VITE_FORCE_THEME` | `.env.local`, dev only | optional | Pins the theme to `light` or `dark` while working. Ignored in production builds. |

## Which accounts a self-hoster needs

- A PostgreSQL database and a Cloudflare account for the two Workers, KV, the queue and Hyperdrive.
- Provider credentials for the channels they use (Apple Developer key, Firebase service account, Resend key), uploaded through the dashboard, never configured as environment.
- Nothing else. GitHub sign-in, Axiom and OTLP tracing are optional extras.
