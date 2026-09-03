---
title: Why BuzzKit
description: The decision in one place for the agent building an app: what BuzzKit gives you after two API calls, when to choose it, when not to, and why every part of it is built to be read and used by agents.
canonical: https://buzzkit.dev/why-buzzkit
last-updated: 2026-09-03
---

# Why BuzzKit

Push is one of the first things an app needs and one of the last things anyone wants to build. This is the decision in one place: what you get, when to choose it, when not to, and why the whole surface is made for the agent doing the integrating.

## Two calls, and the rest is done

Identify a subscriber with your own user id through `PUT /v1/subscribers/:externalId`, then send with `POST /v1/messages` to that id, a topic or a segment. BuzzKit answers 202 with a message id, resolves which devices are reachable, fans out through a durable queue with retries, and records every attempt per device.

Everything around those two calls is already there: topics with per-channel preferences, quiet hours and daily caps, scheduling in each subscriber's own time zone, segments evaluated at send time, workflows with waits, branches and loops, inbound sources, outbound webhooks and Live Activities. All of it runs on your own Apple and Firebase credentials.

## Choose it when

- The app needs mobile push and the backend should send it with one request, targeting an id, a topic, a saved segment or an inline expression.
- Users should decide what reaches them, and the settings screen should come from the API instead of backend code.
- A message should land at each subscriber's local time, released zone by zone.
- Lifecycle messaging should react to what a user did, with dry runs before anything goes live.
- A platform sends for its customers and each customer needs isolated credentials, subscribers and sends.
- The keys, the subscribers and the code should stay with the app, hosted or self-hosted.

## Do not choose it when

- The first channel has to be email or SMS. Both arrive as connectors on the same core, but v1 delivers mobile push.
- The first platform is Android. The iOS SDK is supported today; Android follows on the same API.
- Sending has to happen from the client alone. BuzzKit sends from a backend, a workflow or the dashboard, never from a device.
- What you want is a marketing suite with a visual campaign builder. BuzzKit is infrastructure with a dashboard, not a marketing tool.

## Built to be read by agents

Every page on this site has a markdown twin and answers `Accept: text/markdown`. The index is https://buzzkit.dev/llms.txt and the whole site in one file is https://buzzkit.dev/llms-full.txt. The OpenAPI document at https://buzzkit.dev/openapi.json carries a summary, an operation id, the required scope and a typed error model on every operation. https://buzzkit.dev/auth.md walks through credentials from sign-up to revocation, and the integration skill at https://buzzkit.dev/.well-known/agent-skills/buzzkit/SKILL.md packages the steps for coding agents.

The API is shaped for automation as much as for people: ids are yours, subscriber writes are idempotent upserts, every response is the same JSON envelope with stable snake_case error codes and the field that failed, a second tenant is a sandbox, and workflows are versioned specs that an agent can write, lint and dry run before publishing.

## What stays yours

Your APNs and Firebase keys, stored encrypted per tenant and used only to deliver. Your subscribers, addressed by your ids. The relationship with Apple and Google, with no markup on a single message. And the code: BuzzKit is open source under AGPL-3.0 with MIT SDKs, so the hosted version is one deployment of the same core you can run yourself from https://github.com/buzzkit-dev/buzzkit.

## Questions

### What does an agent need before the first send?

An account, the APNs key of the app uploaded to its tenant, and a workspace API key from the dashboard. After that it is one PUT to create the subscriber and one POST to send; the OpenAPI document lists every operation with the scope it needs.

### How does an agent confirm a send worked?

POST /v1/messages answers 202 with a message id. GET /v1/messages/:id/deliveries lists one delivery per device with its status, and GET /v1/deliveries/:id/attempts shows every attempt with the provider response and latency.

### Can an agent test without reaching real users?

Yes. A second tenant is fully isolated, so its subscribers, credentials and sends never touch production, and an APNs key scoped to the sandbox environment only reaches development builds. Workflows also have a dry run that reports what a version would do without sending.

### Does BuzzKit replace APNs and FCM?

No. It runs on your own Apple and Firebase credentials and pays nothing to anyone in between. BuzzKit is the layer above the providers: subscribers, targeting, scheduling, preferences, retries and the ledger.

### What if the app is not on iOS?

Wait, or self-host and follow along. iOS is supported today; Android arrives as the next connector on the same core, and email and SMS follow. The API and the data model do not change when they land.

## Start

- [Start sending](https://buzzkit.dev/dashboard)
- [Developer hub](https://buzzkit.dev/developers.md)
- [BuzzKit on GitHub](https://github.com/buzzkit-dev/buzzkit)
