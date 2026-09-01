import { classify, resendProvider } from '@buzzkit/api/providers/resend/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('classify', () => {
  it('treats auth statuses as credential failures and falls back by status', () => {
    expect(classify(401)).toBe('invalid_credential');
    expect(classify(403)).toBe('invalid_credential');
    expect(classify(429)).toBe('rate_limited');
    expect(classify(500)).toBe('provider_unavailable');
    expect(classify(422)).toBe('unknown');
  });
});

describe('validate', () => {
  it('accepts a key that lists domains', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const result = await resendProvider.validate({
      secret: 're_key',
      details: {},
      environment: 'production',
    });

    expect(result).toEqual({ ok: true });
    const headers = new Headers(
      ((fetchMock.mock.calls[0]![1] as RequestInit).headers ?? {}) as Record<string, string>
    );
    expect(headers.get('authorization')).toBe('Bearer re_key');
  });

  it('surfaces a rejected key with Resend’s message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'API key is invalid' }), { status: 401 })
    );

    const result = await resendProvider.validate({ secret: 'bad', details: {}, environment: 'production' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_credential');
      expect(result.reason).toBe('API key is invalid');
    }
  });

  it('classifies a transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('reset'));

    const result = await resendProvider.validate({ secret: 'x', details: {}, environment: 'production' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('transport');
  });
});

describe('send', () => {
  it('answers unsupported until email sending ships', async () => {
    const result = await resendProvider.send({
      credentialId: 1,
      credentialUpdatedAt: 1,
      secret: 'x',
      details: {},
      environment: 'production',
      endpoint: 'a@b.c',
      payload: { title: 'x' },
      expiresAt: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsupported');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
