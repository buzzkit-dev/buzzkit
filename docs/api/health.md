# Health

## GET /v1/health

Unauthenticated liveness + database connectivity check.

```json
{
  "success": true,
  "data": { "status": "ok", "database": { "status": "ok", "latencyMs": 9 } },
  "error": null,
  "metadata": { "timestamp": 1787176299276 }
}
```

A failing database surfaces through the global error handler as a `PG_*` error envelope with a 5xx status.

## POST /v1/spike/apns *(Phase 0 spike — removed in Phase 4)*

Empty body → unauthenticated APNs HTTP/2 reachability probe. With `{ p8, teamId, keyId, bundleId, deviceToken, environment? }` → signs a provider JWT and delivers a real test push. See [architecture.md](../architecture.md) for the findings.
