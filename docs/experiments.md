# Experiments

The experimentation layer: variants, assignment, goals, and the analytics that call a winner. **Status: designed (2026-09-01, during the E9 grammar review), deliberately deferred to its own phase so it ships whole** — entity, pages, statistics, and code definition together, as a headline capability rather than an inline afterthought. OneSignal barely plays here (send variants, compare clicks, promote by hand); Braze is the bar, and beating Braze means conversion measured against real events with the readout built in.

## The decision that shaped this

During E9 review the split/goal grammar was fully agreed (sections 1, 2 and 8 of the E9 capabilities page), and then deliberately pulled out: an inline-only experiment with per-subject readouts would work, but experiments are worth a first-class face — their own entity, their own pages, their own analytics — the way segments and workflows got theirs. Half-shipping it as workflow syntax would undersell one of the product's strongest selling points.

## The model

One **Experiment** entity holds what the E9 design proved out, unchanged:

```jsonc
{
  "slug": "trial-offer",
  "name": "Trial win-back offer",
  "status": "running",            // draft | running | concluded
  "variants": [
    { "name": "control",  "weight": 1 },
    { "name": "discount", "weight": 1 }
  ],
  "goal": { "event": "subscription.started", "within": "7d" },  // where? on the goal, same expression grammar
  "winner": null                   // set on conclude
}
```

- **Weights are ratios** (decided): share = weight ÷ sum, dashboard displays percentages. `[1, 1]` → 50/50, `[9, 1]` → 90/10. Ratios cannot be invalid; percentages break neighbors on edit.
- **Assignment is the industry hash** (decided): hash(experiment · subscriberId) → uniform bucket 0–9999 → cumulative weight ranges. Deterministic: same subscriber, same arm, zero storage, zero coordination across a million actors — the Optimizely/LaunchDarkly/GrowthBook/Braze mechanic. 50/50 is exact in expectation, converging with volume; round-robin counters were rejected (coordination, order bias, broken determinism).
- **One goal per experiment** (primary conversion, Braze-style). The window anchors on entry; conversion counts after the run/send completed; once per subject; `$run.converted` / the message-side equivalent carries experiment, variant, and the converting event id. Judged in the subscriber's actor on ingest, like `cancelOn` — no polling.

## The faces

Every face references the same entity; every send through any face records its arm on the delivery row, so receipts and conversions inherit it.

1. **Messages**: `POST /v1/messages { "experiment": "trial-offer", "variants": { "control": { "title": "…" }, "discount": { "title": "…" } } }` — the campaign face: segment + schedule + experiment is the full Braze campaign, on the messages entity (campaigns stay absorbed per E4).
2. **Workflows**: the `split` step (`{ "name": "offer-test", "split": [{ "name": "control", "weight": 1, "steps": […] }, …] }`) either inline or referencing an experiment slug for shared assignment; `steps.<name>.arm` in scope; lanes render like a branch with percentages. Lint: 2–10 arms, unique names, renaming the step reshuffles (warned on version diff).
3. **Code**: the server SDK creates and references experiments (`buzz.experiments.create`, `buzz.send({ experiment })`); inline variants on a send **materialize** an experiment record automatically, so nothing ever runs unmeasured or invisible.
4. **The Experiments pages**: the list (running / concluded, entered, per-variant conversion so far, a live winner indicator), and the experiment page — per-variant funnel (entered → delivered → opened → converted), uplift vs control, significance, and **Conclude**: pick the winner (or accept the computed one), optionally roll the winning variant to 100% for future sends.

## Analytics and the winner

- Counts are Tinybird: entered per arm, converted per arm, the funnel from the existing delivery/receipt events — no new tables beyond the experiment entity and the arm column on deliveries/runs.
- **Significance**: two-proportion test (chi-squared) with the sample sizes shown honestly; "not enough data yet" is a first-class state, never a hidden default. A Bayesian "probability B beats A" readout is the friendlier headline number; ship both, lead with Bayesian.
- **Winner selection is manual with a recommendation** in v1 (Conclude shows the math and proposes). Auto-shifting traffic Braze-style ("Intelligent Selection") is explicitly later.
- Holdout groups (a global percentage receiving nothing, for measuring the program itself) fit the entity cleanly (`holdout: { weight }`) and are a fast follow, not v1.

## Interlocks with shipped work

- E9's `repeat`/`forEach`/`waitFor`/policy do not touch this design; the `split` step slot in the grammar stays reserved.
- The delivery row's arm column and the assignment function are the shared core — build them once in this phase, both faces consume them.
- The E9 capabilities page (artifact "Workflows III Grammar") holds the reviewed wording of sections 1, 2 and 8; this doc supersedes it as the source of truth for the experiment parts.

## Open questions for the phase kickoff

- Does a message-face experiment allow reuse across multiple sends (same assignment, cumulative results) in v1, or is one experiment bound to one message and reuse arrives with the workflow reference?
- Variant payload overrides: full payload per variant, or named overrides on a shared base (the E9 page proposed overrides — revisit with the composer design).
- Where the Experiments pages sit in the IA (own sidebar entry under Messaging, most likely).
