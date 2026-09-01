import { env } from 'cloudflare:workers';
import { apnsProvider } from '@buzzkit/api/providers/apns/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateP8 } from '../../utils/providerKeys';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(env as unknown as Record<string, unknown>, { PROVIDER_CACHE: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function apnsResponse(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('validate', () => {
  it('accepts a key APNs rejects only for the fake device token', async () => {
    const p8 = await generateP8();
    fetchMock.mockResolvedValueOnce(apnsResponse(400, { reason: 'BadDeviceToken' }));

    const result = await apnsProvider.validate({
      secret: p8,
      details: { teamId: 'TEAM123456', keyId: 'KEYID12345', bundleId: 'com.example.app' },
      environment: 'sandbox',
    });

    expect(result).toEqual({ ok: true });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('api.sandbox.push.apple.com');
  });

  it('rejects an unparseable private key without calling APNs', async () => {
    const result = await apnsProvider.validate({
      secret: 'not-a-key',
      details: { teamId: 'T', keyId: 'K', bundleId: 'b' },
      environment: 'production',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies a credential APNs rejects', async () => {
    const p8 = await generateP8();
    fetchMock.mockResolvedValueOnce(apnsResponse(403, { reason: 'InvalidProviderToken' }));

    const result = await apnsProvider.validate({
      secret: p8,
      details: { teamId: 'TEAM123456', keyId: 'KEYID12345', bundleId: 'com.example.app' },
      environment: 'production',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_credential');
      expect(result.reason).toBe('InvalidProviderToken');
    }
  });

  it('reports a transport failure as unreachable', async () => {
    const p8 = await generateP8();
    fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'));

    const result = await apnsProvider.validate({
      secret: p8,
      details: { teamId: 'TEAM123456', keyId: 'KEYID12345', bundleId: 'com.example.app' },
      environment: 'production',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('transport');
  });
});
