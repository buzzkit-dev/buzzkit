# Overview

buzzkit is an open-source, self-hostable, **code-first push notification framework** — a modern, developer-first alternative to OneSignal focused on simplicity, multi-tenancy, and clean DX. It should feel like a framework (in the spirit of React Email, SST, or Alchemy), not a dashboard-heavy SaaS product.

## The two-layer model

1. **The framework** — fully headless, everything defined in code. Multi-tenant workspaces, per-tenant APNs/FCM credentials, device token lifecycle, sending, and code-defined campaigns/segments/workflows pushed via the CLI.
2. **The platform** — a full product (dashboard + hosted version) that under the hood is *just a deployment of the framework's multi-tenant core*. The hosted version is a free OneSignal alternative; each hosted customer is a tenant/workspace of the same architecture a self-hoster runs.

This is the load-bearing constraint: if the platform ever needs something the framework doesn't expose, the framework is wrong.

## Core goals

- Fully open source and free to self-host
- Code-first: campaigns, segments, triggers, and workflow logic are versioned specs stored in buzzkit; code (`defineWorkflow` + `buzzkit push`, or the SDK) is the best way to write them, and the dashboard, an agent or the API create the very same objects — there is no deploy step
- Multi-tenant by design: workspaces with full credential and data isolation
- Excellent DX for both one-off sends and complex workflows
- Support platforms offering push to *their* customers (each tenant brings their own APNs keys / FCM projects)
- Keep the core simple and focused

## Channels

v1 ships **mobile push only** (APNs + FCM), but channels are a first-class generic concept. buzzkit does not compete with providers (Resend, Twilio, …) — like SST wraps AWS, buzzkit wraps provider credentials with a really nice code-first SDK. Future channels (email, SMS, web push) arrive as modular connectors; workflow/campaign/segment primitives are channel-agnostic from day one.

## Workflows (direction)

Event-based: the app (native iOS SDK) and the server track events; workflows react with time and state — delays, local-time and quiet-moment delivery, event waits, conditions (opened the previous message, used the product within 3 days), branching, a signed `fetch` for data that lives in your database — and buzzkit keeps the clocks, the preferences and the receipts. Generic across channels. The design is in [engine.md](engine.md).

## v1 scope

- Mobile push (APNs + FCM)
- Multi-tenant workspaces with encrypted per-tenant credential storage
- Device token management and lifecycle (registration, invalidation, cleanup)
- Simple send API + TypeScript-first SDK
- Code-first campaign / segment definitions
- Self-hostable architecture

## Out of scope for v1

- Multi-channel (email, SMS, in-app) as a primary feature
- Visual workflow builders / heavy marketing automation
- AI-driven engagement features

## Design principles

- **The spec is the source of truth** — versioned definitions in buzzkit; code is the best way to write them, the dashboard shows and edits the same objects
- **Multi-tenancy first** — isolation per workspace is the core primitive, not an afterthought
- **Start narrow, stay simple** — mobile push first; channels stay pluggable
- **Framework, not platform** — composability and developer control over opinionated UI
- **Practical over clever**
