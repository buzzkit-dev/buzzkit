# buzzkit Docs

Product and architecture documentation — the source of truth for what we're building. One topic per file.

- [overview.md](overview.md) — product vision, goals, scope, and design principles
- [roadmap.md](roadmap.md) — the phased build plan, tenancy model, and pending decisions
- [architecture.md](architecture.md) — runtime, API layers, APNs egress findings, testing, secrets
- [configuration.md](configuration.md) — every variable, secret and binding, what it is for, and what a self-hoster actually needs
- [authentication.md](authentication.md) — credentials, scopes, workspace addressing, isolation invariants
- [data-model.md](data-model.md) — schema conventions and tables per phase
- [design.md](design.md) — the design system: tokens, components, motion, writing, the dashboard conventions (served at `/design.md`)
- [dashboard.md](dashboard.md) — `apps/web`: auth architecture, route map, the onboarding flow, and the dashboard phase plan
- [api/conventions.md](api/conventions.md) — envelope, ids, verbs, lists, errors, idempotency, headers — the contract every endpoint follows
- api/ — one file per API resource: [health](api/health.md), [workspaces](api/workspaces.md), [tenants](api/tenants.md), [keys](api/keys.md), [credentials](api/credentials.md), [events](api/events.md), [subscribers](api/subscribers.md), [topics](api/topics.md), [messages](api/messages.md), [client](api/client.md)
