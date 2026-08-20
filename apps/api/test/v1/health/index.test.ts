import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';

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
