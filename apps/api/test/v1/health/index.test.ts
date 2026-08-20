import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { setupWorkspace } from '../../utils/setup';

describe('GET /v1/health', () => {
  it('returns ok with a live database check inside the envelope', async () => {
    const { status, body } = await api<{
      status: string;
      database: { status: string; latencyMs: number };
    }>('/v1/health');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.metadata.timestamp).toBeTypeOf('number');
    expect(body.data?.status).toBe('ok');
    expect(body.data?.database.status).toBe('ok');
    expect(body.data?.database.latencyMs).toBeTypeOf('number');
  });
});

describe('error envelope', () => {
  it('wraps unknown routes in the standard envelope', async () => {
    const { status, body } = await api('/v1/does-not-exist');

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(body.metadata.timestamp).toBeTypeOf('number');
  });

  it('wraps malformed JSON and unsupported methods in the envelope', async () => {
    const { keyBearer } = await setupWorkspace();
    const malformed = await fetch(`${BASE_URL}/v1/tenants`, {
      method: 'POST',
      headers: { ...keyBearer, 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);
    const body = (await malformed.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(['PARSE', 'VALIDATION', 'BAD_REQUEST']).toContain(body.error.code);

    const unsupported = await api('/v1/health', { method: 'DELETE' });
    expect(unsupported.status).toBe(404);
    expect(unsupported.body.success).toBe(false);
  });

  it('wraps validation failures in the standard envelope', async () => {
    const { status, body } = await api('/v1/spike/apns', {
      method: 'POST',
      body: JSON.stringify({ environment: 'not-a-real-environment' }),
    });

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error?.code).toBe('VALIDATION');
  });
});
