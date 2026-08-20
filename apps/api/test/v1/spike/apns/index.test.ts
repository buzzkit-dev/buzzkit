import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';

// Documents the LOCAL workerd behavior for the APNs HTTP/2 requirement. The
// authoritative production check is the same probe against the deployed
// Worker (see docs/architecture.md — APNs egress).
describe('POST /v1/spike/apns (probe mode)', () => {
  it('reports whether the local runtime reached APNs over HTTP/2', async () => {
    const { status, body } = await api<{
      mode: string;
      http2: boolean;
      status: number | null;
      reason: string | null;
      error: string | null;
    }>('/v1/spike/apns', { method: 'POST', body: JSON.stringify({}) });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.mode).toBe('probe');

    if (body.data?.http2) {
      // HTTP/2 negotiated: APNs answered at the HTTP layer (403 without a token)
      expect(body.data.status).toBe(403);
      expect(body.data.reason).toBe('MissingProviderToken');
    } else {
      // Known workerd-on-macOS limitation (cloudflare/workerd#4841) — the
      // probe must still fail loudly with a transport error, not hang
      expect(body.data?.error).toBeTruthy();
    }
  });
});
