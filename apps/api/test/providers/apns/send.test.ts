import { apnsProvider } from '@buzzkit/api/providers/apns/index';
import { createTokenMemo } from '@buzzkit/api/providers/shared/cache';
import type { ProviderSendInput } from '@buzzkit/api/providers/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateP8 } from '../../utils/providerKeys';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();
let p8: string;

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  p8 = await generateP8();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function sendInput(overrides: Partial<ProviderSendInput> = {}): ProviderSendInput {
  return {
    credentialId: 1,
    credentialUpdatedAt: 1000,
    secret: p8,
    details: { teamId: 'TEAM123456', keyId: 'KEYID12345', bundleId: 'com.example.app' },
    environment: 'production',
    endpoint: 'a'.repeat(64),
    payload: { title: 'Hey' },
    expiresAt: null,
    tokens: createTokenMemo(),
    ...overrides,
  };
}

function apnsResponse(
  status: number,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('send', () => {
  it('delivers and returns the apns-id', async () => {
    fetchMock.mockResolvedValueOnce(apnsResponse(200, {}, { 'apns-id': 'ABC-123' }));

    const result = await apnsProvider.send(sendInput());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe('ABC-123');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.push.apple.com/3/device/${'a'.repeat(64)}`);
    const headers = new Headers(((init as RequestInit).headers ?? {}) as Record<string, string>);
    expect(headers.get('apns-push-type')).toBe('alert');
    expect(headers.get('apns-priority')).toBe('10');
    expect(headers.get('apns-topic')).toBe('com.example.app');
    expect(headers.get('authorization')).toMatch(/^bearer /);
  });

  it('sends silent and normal-priority pushes at priority 5', async () => {
    fetchMock.mockResolvedValue(apnsResponse(200));

    await apnsProvider.send(sendInput({ payload: { silent: true } }));
    await apnsProvider.send(sendInput({ payload: { title: 'x', priority: 'normal' } }));

    const first = new Headers(
      ((fetchMock.mock.calls[0]![1] as RequestInit).headers ?? {}) as Record<string, string>
    );
    const second = new Headers(
      ((fetchMock.mock.calls[1]![1] as RequestInit).headers ?? {}) as Record<string, string>
    );
    expect(first.get('apns-priority')).toBe('5');
    expect(first.get('apns-push-type')).toBe('background');
    expect(second.get('apns-priority')).toBe('5');
  });

  it('targets the live activity topic for live activity pushes', async () => {
    fetchMock.mockResolvedValueOnce(apnsResponse(200));

    await apnsProvider.send(sendInput({ payload: { liveActivity: { event: 'update', contentState: {} } } }));

    const headers = new Headers(
      ((fetchMock.mock.calls[0]![1] as RequestInit).headers ?? {}) as Record<string, string>
    );
    expect(headers.get('apns-topic')).toBe('com.example.app.push-type.liveactivity');
    expect(headers.get('apns-push-type')).toBe('liveactivity');
  });

  it('carries the expiry and collapse id headers', async () => {
    fetchMock.mockResolvedValueOnce(apnsResponse(200));
    const expiresAt = new Date('2026-09-02T00:00:00.000Z');

    await apnsProvider.send(sendInput({ expiresAt, payload: { title: 'x', collapseId: 'thread-9' } }));

    const headers = new Headers(
      ((fetchMock.mock.calls[0]![1] as RequestInit).headers ?? {}) as Record<string, string>
    );
    expect(headers.get('apns-expiration')).toBe(String(Math.floor(expiresAt.getTime() / 1000)));
    expect(headers.get('apns-collapse-id')).toBe('thread-9');
  });

  it('classifies a dead token and captures the response', async () => {
    fetchMock.mockResolvedValueOnce(apnsResponse(410, { reason: 'Unregistered' }));

    const result = await apnsProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_endpoint');
      expect(result.reason).toBe('Unregistered');
      expect(result.response).toEqual({ status: 410, body: { reason: 'Unregistered' } });
    }
  });

  it('carries Retry-After on a rate limit', async () => {
    fetchMock.mockResolvedValueOnce(
      apnsResponse(429, { reason: 'TooManyRequests' }, { 'retry-after': '30' })
    );

    const result = await apnsProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('rate_limited');
      expect(result.retryAfterSeconds).toBe(30);
    }
  });

  it('mints the JWT once per credential and reuses it within the memo', async () => {
    fetchMock.mockResolvedValue(apnsResponse(200));
    const tokens = createTokenMemo();

    await apnsProvider.send(sendInput({ tokens }));
    await apnsProvider.send(sendInput({ tokens }));

    const first = new Headers(
      ((fetchMock.mock.calls[0]![1] as RequestInit).headers ?? {}) as Record<string, string>
    ).get('authorization');
    const second = new Headers(
      ((fetchMock.mock.calls[1]![1] as RequestInit).headers ?? {}) as Record<string, string>
    ).get('authorization');
    expect(first).toBe(second);
  });

  it('evicts an expired provider token and retries once with a fresh one', async () => {
    fetchMock
      .mockResolvedValueOnce(apnsResponse(403, { reason: 'ExpiredProviderToken' }))
      .mockResolvedValueOnce(apnsResponse(200, {}, { 'apns-id': 'RETRIED' }));

    const result = await apnsProvider.send(sendInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe('RETRIED');
  });

  it('gives up after a second expired-token rejection', async () => {
    fetchMock.mockResolvedValue(apnsResponse(403, { reason: 'ExpiredProviderToken' }));

    const result = await apnsProvider.send(sendInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_credential');
  });

  it('reports an unusable key as invalid_credential without calling APNs', async () => {
    const result = await apnsProvider.send(sendInput({ secret: 'not-a-key' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies a transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'));

    const result = await apnsProvider.send(sendInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('transport');
      expect(result.response).toBeNull();
    }
  });
});
