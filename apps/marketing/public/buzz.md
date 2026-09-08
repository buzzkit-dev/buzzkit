---
title: Buzz
description: Buzz gives your coding agents one endpoint. They tell you when work finishes, keep progress on your lock screen while it runs, and flag when they are blocked and need you.
canonical: https://buzzkit.dev/buzz
last-updated: 2026-09-07
---

# Buzz

Buzz gives your coding agents one endpoint. They tell you when work finishes, keep progress on your lock screen while it runs, and flag when they are blocked and need you. No account, no SDK, nothing to install on the machine running the agent.

## One endpoint, one call

Install Buzz, and the app hands you a URL. Anything that can make an HTTP request can reach your phone with it: every coding agent, every CI job and every shell script you already have.

```bash
curl -X POST https://ping.buzzkit.dev/YOUR_KEY \
  -d '{"title": "Tests passed", "body": "142 passed in 38s"}'
```

That is the whole learning curve for the simple case. Everything else is one more field on the same call, so there is no second endpoint to discover and no lifecycle for an agent to get wrong.

## Long work belongs on the lock screen

A notification is the wrong shape for work that takes twenty minutes. You either get one ping at the end or forty along the way. Add a `session` and the same call drives a Live Activity instead: it updates in place, stays glanceable on the lock screen and in the Dynamic Island, and ends when the work does.

```http
POST https://ping.buzzkit.dev/YOUR_KEY
{
  "session": "buzzkit/ts-sdk",
  "title": "Running migrations",
  "body": "3 of 7 applied",
  "status": "working",
  "progress": 0.43,
  "agent": "claude-code",
  "project": "buzzkit"
}
```

The session id is yours and you reuse it. Send it again with new values to update the same row, and send `done` or `failed` to close it out. Name an `agent` and the notification carries that agent's avatar.

## Several agents become one view

Run four agents at once and you get one Live Activity, not four fighting for the same space. Each agent reports only its own session and never coordinates with the others; the merge happens on the server, which is the part a forwarding script cannot do.

One session renders in full detail with its progress. Several collapse into a list ordered by whoever needs you first: anything waiting on you floats to the top, then failures, then work still running.

## Waiting on you

An agent sets `status` to `waiting` when it is blocked on you. The session floats to the top of the lock screen as "Waiting on you" and breaks through even while you are at your desk, because an agent that has stopped is the one thing you cannot afford to miss.

Buzz reports; it never acts for you. There is no reply and no approve button, so nothing can be read as consent. You make the call where you always have, in your editor.

## Quiet when you are already watching

An agent that reports honestly reports often, and most of that is worth seeing without being interrupted for. Buzz knows when you are at your desk: while you are actively working with an agent, updates arrive silently and wait for you in Notification Center. Stop typing and they start reaching you again.

## Twelve updates, one line

Repeated updates on the same piece of work never stack up. With a Live Activity running they only update it; without one they collapse into a single banner that rewrites itself in place. Either way the agent reports freely and your lock screen stays one line, so nothing has to be held back to avoid becoming noise.

There is no account anywhere in this. No email, no password, no team to join. The app hands you a URL and that is the entire setup.

## Claiming the endpoint

The app shows a six-digit code. Claim it from a shell, or hand it to a coding agent and it claims the endpoint itself. The code works once and expires after five minutes.

```bash
curl -X POST https://ping.buzzkit.dev/pair/claim \
  -d '{"code": "482913"}'

{ "endpoint": "https://ping.buzzkit.dev/bz_…", "mcp": "https://ping.buzzkit.dev/bz_…/mcp" }
```

For Claude Code, the endpoint is also a remote MCP server, so the tools arrive with one command and nothing to install or keep updated.

```bash
claude mcp add --transport http buzz https://ping.buzzkit.dev/YOUR_KEY/mcp
```

For everything else, the endpoint is plain HTTP and the conventions are written for agents to read: point one at [ping.buzzkit.dev/skill.md](https://ping.buzzkit.dev/skill.md) and it can set itself up.

## Built on BuzzKit

Buzz is built on [BuzzKit](https://buzzkit.dev), using the same public SDK and the same API anyone else would use. Live Activities are the hardest thing in the push stack: token lifecycle, push to start, remote updates, throttling and staleness. Buzz exists because a framework that can carry this can carry anything.

Both are open source. Buzz is free, and it always will be.
