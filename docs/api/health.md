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

