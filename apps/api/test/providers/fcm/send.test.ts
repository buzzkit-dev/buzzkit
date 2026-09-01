import { fcmProvider } from '@buzzkit/api/providers/fcm/index';
import { createTokenMemo } from '@buzzkit/api/providers/shared/cache';
import type { ProviderSendInput } from '@buzzkit/api/providers/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateServiceAccount } from '../../utils/providerKeys';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();
let privateKey: string;
let details: Record<string, string>;

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  const raw = await generateServiceAccount('my-project-123');
  privateKey = raw.private_key;
  details = { projectId: raw.project_id, clientEmail: raw.client_email };
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }), { status: 200 });
}

function sendInput(overrides: Partial<ProviderSendInput> = {}): ProviderSendInput {
  return {
    credentialId: 2,
    credentialUpdatedAt: 2000,
    secret: privateKey,
    details,
    environment: 'production',
    endpoint: 'device-token',
    payload: { title: 'Hey' },
    expiresAt: null,
    tokens: createTokenMemo(),
    ...overrides,
  };
}

describe('send', () => {
  it('mints a token then delivers, returning the message name', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'projects/my-project-123/messages/1' }), { status: 200 })
      );

    const result = await fcmProvider.send(sendInput());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe('projects/my-project-123/messages/1');
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://fcm.googleapis.com/v1/projects/my-project-123/messages:send');
    const headers = new Headers(((init as RequestInit).headers ?? {}) as Record<string, string>);
    expect(headers.get('authorization')).toBe('Bearer ya29.token');
  });

  it('reuses the memoized token across sends', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'm/1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'm/2' }), { status: 200 }));
    const tokens = createTokenMemo();

    await fcmProvider.send(sendInput({ tokens }));
    await fcmProvider.send(sendInput({ tokens }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('classifies FCM errors by the detailed error code', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
          { status: 404 }
        )
      );

    const result = await fcmProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_endpoint');
      expect(result.reason).toBe('UNREGISTERED');
    }
  });

  it('falls back to the error status then message when details are missing', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'try later' } }), {
        status: 503,
      })
    );

    const result = await fcmProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('provider_unavailable');
      expect(result.reason).toBe('UNAVAILABLE');
    }
  });

  it('surfaces an oauth failure without calling FCM', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad key' }), { status: 400 })
    );

    const result = await fcmProvider.send(sendInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_credential');
      expect(result.reason).toBe('oauth: bad key');
    }
  });

  it('evicts the cached token on a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }), { status: 401 })
      )
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'm/2' }), { status: 200 }));
    const tokens = createTokenMemo();

    const first = await fcmProvider.send(sendInput({ tokens }));
    const second = await fcmProvider.send(sendInput({ tokens }));

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('classifies a transport failure on the send call', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockRejectedValueOnce(new TypeError('reset'));

    const result = await fcmProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('transport');
  });
});
