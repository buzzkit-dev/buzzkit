---
title: About BuzzKit
description: BuzzKit is the open source notification orchestration layer, self-hostable, a developer-first alternative to hosted push providers, built as a framework first and a product on top.
canonical: https://buzzkit.dev/about
last-updated: 2026-09-01
---

# About BuzzKit

BuzzKit is the open source notification orchestration layer: the infrastructure every app rebuilds around its notifications, shipped as one codebase you can read, run and extend.

## Two layers, one codebase

The core is a headless framework: multi-tenant workspaces with isolated Apple and Firebase credentials, device token lifecycle, sending with durable retries, topics, segments, scheduling and workflows. On top of it sits the platform, a dashboard and a hosted version that is nothing more than a deployment of the same multi-tenant core. If the platform ever needs something the framework does not expose, the framework is wrong. That constraint keeps BuzzKit honest: a single self-hoster and the hosted version running thousands of workspaces use the same code.

## Why it exists

Every app rebuilds the same things around its notifications: token storage, a queue, retries, scheduling, preferences, a way to know what was delivered. Whether you send through APNs directly or through a hosted provider, that work lands on you.

BuzzKit is that work, done once and open source: batteries included, running on your own Apple and Firebase credentials. You keep the relationship with the providers and the data. BuzzKit keeps the clocks, the receipts and the preferences.

## How it is built

The API runs on Cloudflare Workers. Postgres stores what is, Tinybird stores what happened, and a Durable Object per subscriber holds what is true right now, so events for one person are processed in order and workflows answer history questions from the subscriber's own stream. Channels are generic: mobile push ships first, and future channels arrive as connectors without rewriting the core. The documentation is at https://docs.buzzkit.dev, and the code and the roadmap live in the BuzzKit repository: https://github.com/buzzkit-dev/buzzkit
