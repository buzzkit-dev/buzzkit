---
name: copy
description: Rules for every user-facing string in the buzzkit dashboard (page titles and descriptions, card and field hints, empty states, buttons, dialogs, toasts, errors). Use whenever writing, changing or reviewing UI copy, before the string lands in a file.
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

## Per kind of string

**Page title** — the noun, sentence case: "API keys", "Subscribers", "Topics", "General".

**Page description** — one sentence, starts with a verb, says what the page is for, stops. "Manage your workspace API keys." "Manage notification topics." Never a second sentence.

**Card or section description** — one sentence saying what the section holds. "Server-side keys scoped to a single tenant."

**Field hint (`FieldDescription`)** — one informational sentence: what the thing is, and where or how it is used. When the hint follows a select, describe the selected option as a thing: "Tenant keys are scoped to a single tenant and can't reach anything outside it." For plain inputs, state the format or constraint: "Lowercase letters, numbers and hyphens." "Must be at least 8 characters."

**Empty state** — title "No <things> yet"; description one full sentence that says what puts the first item there and from where. "Identify a user from your backend and they appear here with their devices and preferences."

**Button / CTA** — verb + noun, naming the action exactly: "Create key", "Invite member", "Send test push", "Continue with GitHub". The header CTA and the dialog's submit button say the same thing. Not "New X", not "Add", not "Submit", not "OK".

**Dialog** — a title only, no description (the form explains itself). `AlertDialog` keeps its description: the consequence in one sentence, then "This cannot be undone." when it is irreversible. "Requests with this key start failing immediately. This cannot be undone." Actions: "Cancel" and the verb ("Revoke key", "Delete subscriber").

**Toast** — title on one line, detail in `description`. Success: what happened ("Copied to clipboard", "Invite sent"). Error: what is wrong, then what to do ("Unable to copy" / "Select the key and copy it manually.").

**Inline error** — what is wrong and what to do, addressed to the reader: "Give the key a name." "Pick at least one scope." "This slug is already taken. Try another."

## Banned

- Reassurance and sales: "safe", "secure", "simply", "easily", "powerful", "seamless".
- Fragments joined by periods or semicolons where a sentence belongs.
- Hedges and filler: "just", "only" (as a limiter), "please", "successfully", "etc.", "e.g.".
- Em dashes, en dashes, exclamation marks, ellipses in prose, Title Case, ALL CAPS.
- Jargon the product does not use in its own nouns ("identifies", "provision", "entity", "payload" outside code).
- Describing the UI ("Click the button below", "This page lets you") instead of the thing.
- Explaining mechanics that belong in the docs.

## Vocabulary

Use the API's nouns, and only these: **workspace**, **tenant**, **subscriber**, **subscription**, **topic**, **channel**, **message**, **delivery**, **credential**, **key** (workspace key, tenant key, client key, never token), **member**, **invite**, **webhook**, **event**. Providers are **Apple** and **Android**, the product is **BuzzKit**, the library is **the SDK**, the service is **the API**. People are "you"; the product is never "we" except in "Continue with GitHub"-style platform phrasing.

## Before you finish

Read every new string as the person seeing it for the first time, on the actual screen, and check:

1. Does it do its one job and nothing else?
2. Is it a complete sentence (unless it is a label, title or button)?
3. Would Stripe ship it word for word?
4. Does it use a word from the banned list, or a noun not in the vocabulary?
5. Is it the same length as its neighbours of the same kind?

If any answer is wrong, rewrite before moving on. Copy is never "good enough for now".
