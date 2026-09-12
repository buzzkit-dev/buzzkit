---
name: review
description: How to run a cleanup or review pass over a change in this repo — scoping the diff, delegating breadth, proving every finding, and the traps that make a pass look green when it is not. Use before merging anything large, when asked to review or clean up code, or when CI fails in a way the tests do not reproduce locally.
---

# Running a review pass

Load the `conventions` skill first. This skill is the method; that one is the standard you judge against.

A finding you cannot reproduce is a guess. A fix you have not watched fail without it is a hope. Everything below exists to keep those two out of the report.

## 1. Scope the diff before reading a line

```sh
git status --short          # column 1 = staged, column 2 = worktree
git diff HEAD --stat
git status --short | awk '{print $NF}' | cut -d/ -f1-2 | sort | uniq -c | sort -rn
```

**Read the porcelain columns carefully.** `M ` is staged, ` M` is worktree only, `??` is untracked. Confusing them produces confident, wrong findings — a staged test importing untracked source is a real problem; a worktree-only barrel is not.

Separate what is *yours to review* from what is someone else's work in progress sitting in the same tree. Say which is which in the report rather than reviewing both as one change.

## 2. Delegate breadth, keep judgement

Fan out subagents for independent areas, one per coherent slice, and tell each to read the conventions first and report `file:line` with a one-sentence defect and a one-sentence fix. Keep for yourself: the synthesis, the architecture questions, and **verifying every headline finding personally**. A subagent's "CONFIRMED bug" is a hypothesis until you reproduce it.

## 3. Prove findings, and prove fixes

Reproduce the defect, then fix it, then **revert the fix and watch the test fail**. If the test passes either way it is not covering the bug.

```sh
cp src/thing.ts /tmp/keep.ts
# revert the fix
bun run test -- path/to/suite.test.ts -t "the case"
cp /tmp/keep.ts src/thing.ts
```

This caught real things in this repo: a race that produced two merge events without a row lock, a provider that rebuilt its client every render, a transport that made one attempt instead of three.

## 4. Run what CI runs, not something like it

Copy the command out of the workflow file. Approximations hide failures.

```sh
git show origin/main:.github/workflows/test.yml | sed -n '/unit/,/marketing/p'
```

Never run two API suites at once — they share the test port and you will chase phantom failures. Wait for one to finish.

## 5. The checks, in order of what they catch

| Command | Catches |
|---|---|
| `bun lint` | Biome, the comments ban, the verb catalog |
| `bun check-types` | every package plus the API test tree |
| `bunx knip` | dead exports — **run it after exporting anything** |
| `bunx sherif -i @types/node` | dependency version drift across the workspace |
| `bunx publint` | the published manifest shape, not whether it imports |
| `drizzle-kit check` **and** `generate` | schema drift — check alone passes on a broken enum import |

## 6. Traps that make a pass look green

- **A test that asserts the old behavior encodes the bug.** When a fix breaks a test, read it before editing. If it pinned the defect, rewrite it to the corrected contract and say so.
- **`publint` says "all good" for a package Node cannot import.** It reads the manifest. Pack it and import every entry point from a clean directory instead.
- **Type-level parity covers entity shape only.** It is blind to the path, the verb, and the envelope. Four real bugs hid there: a list envelope typed as a single object, a missing resource, an omitted field, a nullability gap. Assert parsed values in resource tests, not just outgoing requests.
- **A green local suite on a long-lived container proves nothing.** Recreate it (`docker compose down -v && bun db:up`), push the Tinybird definitions, and rerun. Unpinned `:latest` images drift under you.
- **`.dev.vars` drifts.** A real Tinybird token with a localhost URL yields `403 Invalid token` and 500s that look like code bugs. CI leaves `TINYBIRD_TOKEN` empty so the API fetches the container's own admin token; local should match.
- **Load-sensitive timeouts.** A suite that fails only in a full run and passes alone is usually a timeout, not a regression. Verify in isolation before reporting it as a break.

## 7. Judge findings, do not obey them

Bots and reviewers are input, not instructions. For each one decide: valid, stale, or a nitpick. Say which.

- A suggested patch can trade one bug for another. Removing a cap on `Retry-After` fixes truncation and introduces an unbounded sleep. Implement the better fix and explain why you departed.
- When two reviewers disagree about where a policy line sits, neither knows the caller's context. Make it an option with a sensible default.
- Fix a nitpick when the fix is free and buys something real, and name the real reason. Pinning `npm@latest` is weak as a supply-chain argument and strong as reproducibility.

## 8. Ownership questions get a written rule

When the same value is defined in several places, decide once and record it. In this repo: **a definition belongs in `buzzkit` exactly when a customer can observe it through the public API.** Sweep for duplicates with a script rather than by eye — extract every `as const` array and literal union across packages and group by member set.

## 9. Close the loop

Every settled pattern goes back into `CLAUDE.md` and the relevant skill in the same change, so the next session starts where this one ended. Update the docs that a behavior change makes wrong, in that same change.

## Reporting

Lead with the verdict. Then confirmed bugs, most severe first, each with what breaks and why. Then the structural finding, if there is one — usually the reason several bugs share a hiding place. Then what you verified green, with real numbers. Name what you could not verify and why, rather than leaving it implied.
