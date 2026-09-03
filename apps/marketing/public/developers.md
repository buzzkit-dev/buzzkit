---
title: Developers
description: The BuzzKit developer hub: the quickstart, API keys and scopes, the REST reference and OpenAPI document, the iOS SDK, a sandbox tenant for testing, and the files agents read.
canonical: https://buzzkit.dev/developers
last-updated: 2026-09-02
---

# Developers

Everything for integrating BuzzKit in one place: the quickstart, keys and scopes, the reference and its OpenAPI document, the SDKs, a sandbox for testing and the surface agents read.

## Quickstart

Create an account at https://buzzkit.dev/signup, upload the APNs key for your app under the default tenant, and create a workspace API key. Then identify a subscriber with your own user id and send:

```
curl https://api.buzzkit.dev/v1/messages \
  -H "Authorization: Bearer bk_ws_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user_42",
    "title": "Leg day",
    "body": "6:00 with Maya."
  }'
```

BuzzKit answers 202 with the message, resolves which devices are reachable, fans out through a durable queue and records every delivery attempt. The full walkthrough, with the subscriber and device steps, is in the documentation: https://docs.buzzkit.dev

## Keys and scopes

Every request carries `Authorization: Bearer <key>`. Workspace keys reach every tenant and pick one with the `buzzkit-tenant` header, tenant keys are locked to one tenant, and client keys ship inside the app and only reach the client API. Keys carry scopes such as `messages:send` or `subscribers:read`, and the scope each operation needs is listed in the OpenAPI document.

Keys are created in the dashboard, shown once and revocable at any time. The complete flow for people and agents, including every error code: https://buzzkit.dev/auth.md

## Reference

The REST API lives under `/v1` at `https://api.buzzkit.dev`. Every response is a JSON envelope with `success`, `data`, `error` and `metadata`, and errors carry a stable snake_case code with the field that failed.

- Documentation, guides and the reference for every resource: https://docs.buzzkit.dev
- OpenAPI document, every operation with its scope, request and response schemas: https://buzzkit.dev/openapi.json
- API catalog, the RFC 9727 linkset that points at both: https://buzzkit.dev/.well-known/api-catalog
- The repository, the API, the dashboard and the docs under AGPL-3.0, the SDKs under MIT: https://github.com/buzzkit-dev/buzzkit

## SDKs

The iOS SDK handles registration, identity, events, action buttons, Live Activities and a notification settings screen in Swift: https://github.com/buzzkit-dev/buzzkit-ios. The server SDK lives in the repository under `packages/buzzkit` and reaches npm with the public launch. Android follows on the same core.

## Testing without touching production

A tenant is the isolation boundary, so a second tenant is a sandbox: its subscribers, credentials, sends and workflows never mix with production, and an APNs key scoped to Apple's sandbox environment delivers to development builds only. Workflows also have a dry run, `POST /v1/workflows/:slug/test`, which walks a version through the engine for one subscriber and reports what it would have done without sending anything.

## For agents

Every page on this site has a markdown twin and answers `Accept: text/markdown`.

- The index: https://buzzkit.dev/llms.txt
- The whole site in one file: https://buzzkit.dev/llms-full.txt
- The integration skill for coding agents: https://buzzkit.dev/.well-known/agent-skills/buzzkit/SKILL.md
- The resource catalog: https://buzzkit.dev/.well-known/ard.json
