import { classifyHttpStatus, providerFetch, retryAfterSeconds } from '@buzzkit/api/providers/shared/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('providerFetch', () => {
  it('captures the status and parses a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ reason: 'BadTopic' }), { status: 400 }));

    const result = await providerFetch('https://example.com', { method: 'POST' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.captured).toEqual({ status: 400, body: { reason: 'BadTopic' } });
  });

  it('keeps a non-JSON body as text and an empty body as null', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('plain', { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const text = await providerFetch('https://example.com', {});
    const empty = await providerFetch('https://example.com', {});

    expect(text.ok && text.captured.body).toBe('plain');
    expect(empty.ok && empty.captured.body).toBeNull();
  });

  it('classifies a timeout distinctly from a transport failure', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeout).mockRejectedValueOnce(new TypeError('reset'));

    const timedOut = await providerFetch('https://example.com', {});
    const transport = await providerFetch('https://example.com', {});

    expect(!timedOut.ok && timedOut.code).toBe('timeout');
    expect(!transport.ok && transport.code).toBe('transport');
  });
});

describe('classifyHttpStatus', () => {
  it('maps 429 and 5xx, everything else is unknown', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limited');
    expect(classifyHttpStatus(500)).toBe('provider_unavailable');
    expect(classifyHttpStatus(599)).toBe('provider_unavailable');
    expect(classifyHttpStatus(418)).toBe('unknown');
  });
});

describe('retryAfterSeconds', () => {
  it('accepts seconds (floored to at least 1) and HTTP dates, ignores garbage', () => {
    const response = (value: string | null) =>
      new Response(null, { headers: value ? { 'retry-after': value } : {} });
    expect(retryAfterSeconds(response('30'))).toBe(30);
    expect(retryAfterSeconds(response('0.4'))).toBe(1);
    expect(retryAfterSeconds(response(new Date(Date.now() + 90_000).toUTCString()))).toBeGreaterThanOrEqual(
      88
    );
    expect(retryAfterSeconds(response(new Date(Date.now() - 90_000).toUTCString()))).toBe(1);
    expect(retryAfterSeconds(response('soon'))).toBeUndefined();
    expect(retryAfterSeconds(response(null))).toBeUndefined();
  });
});
