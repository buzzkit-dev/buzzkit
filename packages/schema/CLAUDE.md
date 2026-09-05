# @buzzkit/schema — what the API and the dashboard both validate

Private. Grammars that two sides of the platform must agree on, one subpath per grammar: `@buzzkit/schema/workflows`, `@buzzkit/schema/sources` and `@buzzkit/schema/imports`. Everything in here is used by both the API (to validate a document before it accepts it) and the dashboard (to lint as you type and to draw the definition); anything only one side needs lives with that side.

```
src/workflows/
  types.ts          The spec: triggers, steps, expressions, what each key takes
  constants.ts      Limits, patterns and vocabularies (step kinds, filters, sources)
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

Nothing here runs a workflow: rendering templates (`engine/template.ts`), the next fire of a schedule (`api/workflows/cron.ts`), zone arithmetic (`libs/timezone.ts`), evaluating conditions (`actor/evaluate.ts`) and the TypeBox request schemas (`api/workflows/schema.ts`, `api/segments/schema.ts`) are the API's. Nothing here is public: workflows are defined in the dashboard or through the API, never from customer code, so the public `buzzkit` SDK holds none of this. The expression grammar the workflow language extends (`ref`, `count`, `never`, groups) is public in `buzzkit/expressions` because inline segments on a send are.

Same rules as the SDK package: no comments, names written out, runtime-neutral web platform APIs only, tests mirror `src/` in `test/`, `bun run test` here.
