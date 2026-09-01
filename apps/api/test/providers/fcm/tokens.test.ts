import { requestAccessToken, TokenError, tokenCacheKey } from '@buzzkit/api/providers/fcm/tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateServiceAccount } from '../../utils/providerKeys';

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

async function account() {
  const raw = await generateServiceAccount('my-project-123');

  return { project_id: raw.project_id, client_email: raw.client_email, private_key: raw.private_key };
}

describe('requestAccessToken', () => {
  it('exchanges a signed assertion for an access token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3599 }), { status: 200 })
    );

    const result = await requestAccessToken(await account());

    expect(result).toEqual({ ok: true, accessToken: 'ya29.token', expiresIn: 3599 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    const body = String((init as RequestInit).body);
    expect(body).toContain('grant_type=');
    expect(body).toContain('assertion=');
  });

  it('rejects a non-RSA private key without calling Google', async () => {
    const result = await requestAccessToken({
      project_id: 'my-project-123',
      client_email: 'svc@x.iam',
      private_key: 'not-a-key',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies token endpoint answers by status', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rate' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'down' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT' }), {
          status: 400,
        })
      );

    const limited = await requestAccessToken(await account());
    const unavailable = await requestAccessToken(await account());
    const rejected = await requestAccessToken(await account());

    expect(!limited.ok && limited.code).toBe('rate_limited');
    expect(!unavailable.ok && unavailable.code).toBe('provider_unavailable');
    expect(!rejected.ok && rejected.code).toBe('invalid_credential');
    if (!rejected.ok) expect(rejected.reason).toBe('Invalid JWT');
  });

  it('classifies a transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'));

    const result = await requestAccessToken(await account());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('transport');
  });
});

describe('token plumbing', () => {
  it('scopes the cache key to the credential and its version', () => {
    expect(tokenCacheKey({ credentialId: 3, credentialUpdatedAt: 99 })).toBe('fcm:token:3:99');
  });

  it('TokenError carries the delivery code', () => {
    const error = new TokenError('rate_limited', 'slow down');
    expect(error.code).toBe('rate_limited');
    expect(error.message).toBe('slow down');
  });
});
