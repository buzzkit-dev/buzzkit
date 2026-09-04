---
title: Why BuzzKit
description: Everything a notification needs is already built: the SDK goes in once, your app sends events, and workflows do the rest on the platform instead of in your backend.
canonical: https://buzzkit.dev/why-buzzkit
last-updated: 2026-09-03
---

# Why BuzzKit

The promise is that you stop building notification infrastructure. The SDK goes in once, your app and your backend send events, and everything after that happens on the platform: targeting, timing, preferences, retries and receipts.

## The SDK goes in once

Five lines at launch is the whole client integration. Configure with the client key, say who the device belongs to, register for push, and track what people do. There is no token upload endpoint to write, no refresh handling, no permission bookkeeping, no payload parsing.

```swift
BuzzKit.configure(apiKey: "bk_pk_live_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed")
```

From then on the device is a subscriber you address by your own user id, across every device it owns, and the SDK keeps tokens, locale, time zone and notification permission current on its own.

## Then you only send events

BuzzKit is event based end to end. Your app tracks what a user did, your backend posts the events it owns, and inbound sources bring in what happens in Stripe, RevenueCat or Superwall. That is the entire integration surface: facts about your users, in one stream per subscriber, in order.

Sending a message directly is still one call to `POST /v1/messages`, addressed to an id, a topic, a saved segment or an inline expression. Most notifications should not be a call from your code at all.

## Workflows instead of backend code

A workflow starts on an event and does the waiting, the branching, the looping and the sending. Wait three days, wait for a follow-up event with a timeout, branch on an attribute, exit when the user converted, send, wait again. The trial reminder, the abandoned checkout nudge, the win-back, the streak: all of them are a workflow, not a cron job, a queue and a table in your database.

They are versioned specs with a linter and a dry run, so a change is checked and rehearsed before it can reach anyone, and every run is recorded step by step. Nothing about them lives in your codebase, which means nothing about them needs a deploy.

## Everything notification-related is in the box

The pieces every app ends up building are already there: topics with per-channel preferences and a settings screen you render from the API, quiet hours and daily caps, per-subscriber time zone scheduling, segments evaluated at send time, local notifications scheduled on device from the same rules, action buttons, Live Activities, rich payloads, outbound webhooks, and a delivery ledger with every attempt and provider response per device.

All of it is multi-tenant from the first row, so one workspace or ten thousand is the same code, and all of it runs on your own Apple and Firebase credentials.

## Choose it when

- You want notifications shipped this afternoon and not a service to maintain.
- Lifecycle messaging should react to what a user did, without a scheduler or a job table in your backend.
- Users should decide what reaches them, and the settings screen should come from the API instead of backend code.
- A message should land at each subscriber's local time, released zone by zone.
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

### How much do I have to build myself?

The SDK at launch and the events you already know about. Configure, identify, register for push and track: after that the token lifecycle, targeting, scheduling, preferences, retries and the delivery record are the platform's job, not code in your app or your backend.

### Do I need server code for lifecycle notifications?

No. A workflow starts on an event and holds the waits, branches, loops and sends, so the trial reminder or the win-back is a versioned spec you publish instead of a cron job, a queue and a table in your database. Your backend only reports what happened.

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
