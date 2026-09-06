# @buzzkit/schema — what the API and the dashboard both validate

Private. Grammars that two sides of the platform must agree on, one subpath per grammar: `@buzzkit/schema/workflows`, `@buzzkit/schema/sources` and `@buzzkit/schema/imports`. Everything in here is used by both the API (to validate a document before it accepts it) and the dashboard (to lint as you type and to draw the definition); anything only one side needs lives with that side.

**This package holds behavior, not types.** The workflow spec and source mapping *types* — and the vocabularies they derive from (`STEP_KINDS`, `TRIGGER_SOURCES`, `SOURCE_PROVIDERS`, …) — describe public API request bodies, so they live in the published `buzzkit` package (`buzzkit/workflows`, `buzzkit/sources`) and the SDK types `workflows.create({ spec })` with them. Each subpath's `index.ts` re-exports them in one line (`export * from 'buzzkit/workflows'`), so `@buzzkit/schema/workflows` stays the single import for internal consumers while there is exactly one definition — there are no pass-through `types.ts` / `constants.ts` files, and code inside this package imports the moved names straight from `buzzkit/*`. What stays defined here is everything that *runs*: the lints, the parsers, the evaluators, the presets, and the validation limits (`MAX_STEPS`, `STEP_NAME_PATTERN`) that only the lint enforces. The dependency runs one way — `buzzkit` ← `@buzzkit/schema` ← `apps/*` — so never import `@buzzkit/schema` from `buzzkit`.

```
src/workflows/
  constants.ts      The lint's own limits and patterns (MAX_STEPS, STEP_NAME_PATTERN); the vocabularies live in buzzkit
  lint/index.ts     lintWorkflow: every problem with a path and a sentence; isWorkflowSpec, workflowProblem
  lint/conditions.ts The run-only conditions (occurred, opened, delivered, since) plugged into buzzkit/expressions' lint
  parse/template.ts Placeholders, filters and the ternary: parseTemplate, lintTemplate, templatePaths
  parse/cron.ts     Five-field cron: parseCron, cronProblem, scheduleFields
  parse/duration.ts isDuration, durationSeconds, describeDuration
  parse/timezone.ts isTimezone
src/sources/        Webhook sources: presets per provider, detectProvider, mapPayload, suggestMapping, lint
src/imports/        Bulk imports (docs/api/imports.md): parseCsv, IMPORT_PRESETS + detectPreset (OneSignal by its signature
                    columns), mapImportRecord / planImport (records → normalized rows + skipped reasons + counts), the row type
                    POST /v1/imports takes and the dashboard's Import subscribers dialog sends
```

Nothing here runs a workflow: rendering templates (`engine/template.ts`), the next fire of a schedule (`api/workflows/cron.ts`), zone arithmetic (`libs/timezone.ts`), evaluating conditions (`actor/evaluate.ts`) and the TypeBox request schemas (`api/workflows/schema.ts`, `api/segments/schema.ts`) are the API's. Behavior here is not public: workflows are still defined in the dashboard or through the API, never from customer code. The spec *shape* is public, because `POST /v1/workflows` takes it and the SDK types `workflows.create({ spec })` with it. The expression grammar the workflow language extends (`ref`, `count`, `never`, groups) is public in `buzzkit/expressions` because inline segments on a send are.

Same rules as the SDK package: no comments, names written out, runtime-neutral web platform APIs only, tests mirror `src/` in `test/`, `bun run test` here.
