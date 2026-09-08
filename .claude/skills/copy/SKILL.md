---
name: copy
description: Write and review BuzzKit dashboard and marketing copy. Use for page copy, feature descriptions, FAQs, labels, hints, buttons and errors.
---

# Copy

Every string a person reads in the dashboard is product, not filler. The bar: Stripe's dashboard and Cloudflare's settings pages. Plain, specific, complete, and exactly as long as the job needs.

## The one rule

**Each string has one job. Do that job in full sentences, then stop.**

A page description says what the page is for. A field hint says what the option is and where it is used. An empty state says how the first item gets there. None of them explain, reassure, sell or warn about things the reader did not ask about.

## What went wrong before (do not repeat)

| Rejected | Why | Written right |
| --- | --- | --- |
| "Manage workspace API tokens. Secret tokens are shown once; client tokens are public and safe to ship." | A page description that explains and reassures. | "Manage your workspace API keys." |
| "For your apps. Public, identifies subscribers only." | Telegraphic fragments, jargon ("identifies"), "only". | "Client keys can be embedded directly in your app and used with the SDK." |
| "Create your first key." | Too short to be useful; says nothing about where a key is used. | "Create a key to call the API from your backend, or a client key to embed in your app." |
| "New key" (button) | Does not name the action; the dialog's own button said "Create key". | "Create key" |
| "API tokens" | The API calls them keys; the dashboard uses the API's words. | "API keys" |
| "Invalid credentials." | Names no cause and no next step. | "Email or password is incorrect" + "Double-check your details or create an account." |
| "Create a tenant for each app." | Tenants are not apps. | "Create a workspace for each app." |

## Marketing copy

Talk like a person. Be useful, specific and clean. Dashboard hint rules below are not a template for landing pages.

A marketing string has one job: say what the reader can do, or what work BuzzKit takes off their hands. Then stop.

**Useful beats short.** “Send at 9 a.m. in each user’s time zone” is useful. “Your notifications, in one place” and “An API, an SDK and a dashboard” are not. A concrete example that explains the feature stays: “Send a trial reminder after three days. Stop it if they subscribe.”

**Heading and description work as a pair.** The description adds information. Do not restate the heading, define the label, or split one thought into slogans. Connected prose, one flowing sentence for a short description.

**Conversational, not cute.** Headings say what the thing unlocks, not what it is. “Complex automations, no custom code” not “Workflows are just documents.” “Schedules too” is a gimmick. Feature names are ordinary words: Workflows, Schedules, Segments.

**Talk normally.** An answer is a sentence a person would say out loud, with a subject and a verb. “Right now you can filter by the event name and a time window” not “Currently by event name and a time window.” “You use one workspace key and name the tenant on each request” not “One workspace key, and name the tenant on the request.” A leading “Yes.” or “No.” is followed by a full sentence, never a noun pile. “Currently only iOS, including Live Activities. Android, email and web push are coming.” not “iOS push and Live Activities today.” Not docs: no JSON fields, publishing mechanics, Xcode, APNs internals or notification service extensions in page copy. Those belong in examples or docs.

**BuzzKit does the heavy lifting.** Bring provider credentials. Device tokens, delivery, retries and tracing are handled. Do not sell “infrastructure you own” or “infrastructure you manage.” The API, dashboard and SDKs are fully open source. Hosted means you sign up and start sending. Self-hosting guides are coming soon: do not link a guide that does not exist.

**Workspaces and tenants.** A workspace is one app. Multiple apps are multiple workspaces: “You can create as many workspaces as you like.” Tenants are only for building on BuzzKit and sending for your customers. Never “a tenant per app.” A single-app page never has to mention tenants.

**Channels.** Currently only iOS, including Live Activities. Do not write as if Android or email already send. iOS-specific pages (the SDK, Live Activities) can say iOS. Every other page stays product-wide and honest when asked.

**Delivery.** Native tracing shows whether a push was sent, delivered or opened, and why it failed. Lead with that, not with Apple’s response or a service extension.

**FAQs.** Questions someone would actually ask before using this page: setup, platforms, cost, delivery, self-hosting, building on BuzzKit. Answers talk normally and, when it helps, link (the pricing page). Not staged objections (“Is the Free plan a crippled version?”), not the feature grid asked back as questions, not Apple-only setup. If the page already has a section or card for it, the FAQ is not that question again. No FAQ is better than a stupid one: Live Activities are iOS-only, so do not ask whether they work on Android.

**Capabilities.** Something the reader might not assume. Not expected behavior: validation, “refused before it can misfire,” honesty about bad input. A daily cap is a daily cap, not a share. Messages go out, not people. A scheduled time is a scheduled time, not a moment.

### Feature pages

Title is a page heading that says what it unlocks (“Send with one call”, “Complex automations, no custom code”), not a definition and not a stacked feature list. A useful example belongs in the intro. Continuation adds one fact. Intro is one or two sentences: the job, and what BuzzKit handles. A section title is a claim; its text adds information; the code sample shows, it does not explain. A capability title names the thing; its text is the extra fact. Keep useful existing copy; a full pass does not require changing every string.

## Per kind of string

**Page title** — the noun, sentence case: "API keys", "Subscribers", "Topics", "General".

**Page description** — one sentence, starts with a verb, says what the page is for, stops. "Manage your workspace API keys." "Manage notification topics." Never a second sentence.

**Card or section description** — one sentence saying what the section holds. "Server-side keys scoped to a single tenant."

**Field hint (`FieldDescription`)** — one informational sentence: what the thing is, and where or how it is used. When the hint follows a select, describe the selected option as a thing: "Tenant keys are scoped to a single tenant and can't reach anything outside it." For plain inputs, state the format or constraint: "Lowercase letters, numbers and hyphens." "Must be at least 8 characters."

**Empty state** — title "No <things> yet"; description one full sentence that says what puts the first item there and from where. "Identify a user from your backend and they appear here with their devices and preferences."

**Button / CTA** — verb + noun, naming the action exactly: "Create key", "Invite member", "Send test push", "Continue with GitHub". The header CTA and the dialog's submit button say the same thing. Not "New X", not "Add", not "Submit", not "OK".

**Dialog** — a title only, no description (the form explains itself). `AlertDialog` keeps its description: the consequence in one sentence, then "This cannot be undone." when it is irreversible. "Requests with this key start failing immediately. This cannot be undone." When the description has two sentences, the second one goes on its own line (`<span className='block'>…</span>`) so a sentence never starts at the end of a row; the wrapped result must look composed, not merely wrapped. Actions: "Cancel" and the verb ("Revoke key", "Remove subscription"). A user-given name inside copy goes in curly quotes (typographic “ ”, never straight "): Revoke “Default”?, Delete “user_42”?

**Toast** — title on one line, detail in `description`. Success: what happened ("Copied to clipboard", "Invite sent"). Error: what is wrong, then what to do ("Unable to copy" / "Select the key and copy it manually.").

**Inline error** — what is wrong and what to do, addressed to the reader: "Give the key a name." "Pick at least one scope." "This slug is already taken. Try another."

## Dashboard restrictions

- Reassurance and sales: "safe", "secure", "simply", "easily", "powerful", "seamless".
- Fragments joined by periods or semicolons where a sentence belongs.
- Hedges and filler: "just", "only" (as a limiter), "please", "successfully", "etc.", "e.g.".
- Em dashes, en dashes, exclamation marks, ellipses in prose, Title Case, ALL CAPS.
- Jargon the product does not use in its own nouns ("identifies", "provision", "entity", "payload" outside code).
- Describing the UI ("Click the button below", "This page lets you") instead of the thing.
- Explaining mechanics that belong in the docs.

## Vocabulary

Use the API's nouns, and only these: **workspace**, **tenant**, **subscriber**, **subscription**, **topic**, **channel**, **message**, **delivery**, **credential**, **key** (workspace key, tenant key, client key, never token), **member**, **invite**, **webhook**, **event**. Providers are **Apple** and **Android**, the product is **BuzzKit**, the library is **the SDK**, the service is **the API**. People are "you"; the product is never "we" except in "Continue with GitHub"-style platform phrasing.

A **workspace** is one app you send for. Multiple apps are multiple workspaces. A **tenant** is a customer of someone building on BuzzKit: you send for them from one workspace. Tenants are not apps, not projects, and not environments. A single-app workspace never has to mention tenants.

## Before you finish

Read every new string as the person seeing it for the first time, on the actual screen, and check:

1. Does it do its one job and nothing else?
2. Is it a complete sentence (unless it is a label, title or button)?
3. Would Stripe ship it word for word?
4. Does it use a word from the banned list, or a noun not in the vocabulary?
5. Is it the same length as its neighbours of the same kind?
6. Did you call an app a tenant? Multiple apps are workspaces. Tenants are customers of someone building on BuzzKit.
7. Is it useful and specific, or empty organization, a feature inventory or a docs definition?
8. Does a FAQ repeat a section already on the page?
9. Is this capability just expected behavior?

If any answer is wrong, rewrite before moving on. Copy is never "good enough for now".
