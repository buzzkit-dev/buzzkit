---
name: is-agentic
description: Score how ready a website, domain, or public MCP endpoint is for AI agents using Is Agentic, and read or act on the resulting report. Use when asked to check a site's agent readiness, get its Is Agentic score, fetch a scored report as JSON, or fix the issues that lower a site's score.
---

# Is Agentic

Is Agentic runs a technical audit of a public URL and publishes a 0 to 100 agent-readiness score with evidence-backed issues and recommended fixes. All interfaces below are public, read-only, and free; none needs an API key.

## Get a score

Default: the official CLI. It returns a stored report immediately, or starts a scan and waits when none exists.

```sh
npx is-agentic <domain> --json
```

Omit `--json` only when a human is reading the terminal output.

When you cannot run commands, use the read-only API instead. It never starts a scan; a 404 means no completed report exists yet.

```
GET https://is-agentic.com/api/v1/report?url=<url-encoded-target>
```

MCP hosts can connect to the Streamable HTTP endpoint `https://is-agentic.com/mcp` and call `is_agentic_get_report`, `is_agentic_get_methodology`, or `is_agentic_get_developer_docs`.

## Read a report

The JSON response is a `PublicScanReport`:

- `score`: 0 to 100, or `null` when the target could not be scored (for example an MCP server that requires authentication). `score_label` explains a null score.
- `score_breakdown.essential` and `.recommended`: each has `earned`, `available`, `passing`, `total`. Essential checks are the ones that matter most; a site can look polished and still fail them.
- `score_breakdown.bonus`: `points` and `positive_signals`. Bonus is additive and never required; do not treat missing bonus signals as defects.
- `issues[]`: each has `id`, `name`, `tier` (`essential` | `recommended` | `bonus`), `result` (`failed` | `partial`), `details` (evidence from the scan), and `recommendation` (the fix). 
- `report_url`: the canonical human-readable report. Cite it when reporting a score to a person.
- `scanned_at`: when the audit ran. Reports are immutable snapshots.

## Improve a site's score

1. Fetch the report for the exact target you are improving.
2. Work through `issues` in this order: `essential` failures, `essential` partials, then `recommended`. Ignore `bonus` unless everything else passes.
3. For each issue, `details` says what the scan observed and `recommendation` says what to change. Prefer the recommendation; it was written against the actual evidence.
4. After deploying fixes, get a fresh score and compare `scanned_at` to confirm you are not reading the old snapshot (see gotchas).

## Errors

Failures are RFC 9457 `application/problem+json` with a stable `code` and a `resolution` hint. Act on the code:

- `invalid_url` (400): pass a public HTTP or HTTPS URL.
- `report_not_found` (404): no completed report exists; create one with the CLI, or open `https://is-agentic.com/scan/<target>` to start a scan, then retry after it completes.
- `rate_limit_exceeded` (429): honor `Retry-After` before retrying.
- `report_temporarily_unavailable` (503): retry shortly; do not start a new scan.

## Gotchas

- Reports refresh only when a visit finds them older than 6 hours. Re-running the CLI right after deploying a fix returns the same stored snapshot; check `scanned_at` before drawing conclusions, and use the Rescan control on the report page when a human needs an immediate re-run.
- The API and the CLI differ on missing reports: the API returns 404, the CLI starts a scan and waits. Pick accordingly.
- Targets are exact: `example.com/docs` and `example.com` are separate reports, and a URL with a query string is its own report.
- The rate limit is 120 requests per IP per 60 seconds.
- For token-light reading, content pages and completed reports honor `Accept: text/markdown`.
