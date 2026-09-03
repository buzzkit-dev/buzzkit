---
title: Privacy
description: What the BuzzKit website and the hosted version collect, what they store, and what never happens with your data.
canonical: https://buzzkit.dev/privacy
last-updated: 2026-09-01
---

# Privacy

BuzzKit handles notification data for a living, so this page is deliberately plain about what is collected and what is not.

Last updated September 1, 2026

## This website

buzzkit.dev is a static site. It sets no cookies, runs no analytics scripts and embeds no trackers. Requests are served by Cloudflare, which processes standard request logs to deliver the site.

## The hosted version

When you create a workspace on the hosted version, BuzzKit stores the data needed to provide the service on your behalf: your account email, your workspace configuration, and the subscribers, device tokens, events, messages and delivery records your integration sends. This data exists so your notifications can be delivered, retried and reported on; it is not used for anything else. Provider credentials, such as APNs keys and FCM service accounts, are stored encrypted and are never returned in full once saved. Your data is never sold and never shared with third parties beyond the infrastructure that runs the service.

## Self-hosted deployments

A self-hosted BuzzKit runs entirely on your own infrastructure. Nothing is sent to buzzkit.dev, and no telemetry leaves your deployment. What you store and how long you keep it is up to you.

## Deletion and questions

Deleting a subscriber through the API removes them and their subscriptions from active use, and deleting a workspace removes its data from the hosted service. For questions about this page or a deletion request, write to hello@buzzkit.dev.
