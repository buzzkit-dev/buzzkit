import { describe, expect, it, vi } from 'vitest';
import {
  type BuzzKitError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from '../../src/core/errors';
import { encodeSegment, randomIdempotencyKey, Transport } from '../../src/core/transport';
import { envelope, failure, type Stub, stub } from '../utils/stub';

function transportFor(source: Stub, overrides: { maxRetries?: number; timeoutMs?: number } = {}) {
  return new Transport({
    baseUrl: 'https://api.test',
    timeoutMs: overrides.timeoutMs ?? 30_000,
    maxRetries: overrides.maxRetries ?? 0,
    headers: { authorization: 'Bearer bk_ws_key' },
    fetch: source.fetch,
  });
}

describe('encodeSegment', () => {
  it('escapes anything that would change the path', () => {
    expect(encodeSegment('user/1')).toBe('user%2F1');
    expect(encodeSegment('a b')).toBe('a%20b');
    expect(encodeSegment('user?x=1#y')).toBe('user%3Fx%3D1%23y');
    expect(encodeSegment('ada@acme.com')).toBe('ada%40acme.com');
  });
});

describe('randomIdempotencyKey', () => {
  it('is unique per call', () => {
    const keys = new Set(Array.from({ length: 100 }, randomIdempotencyKey));
    expect(keys.size).toBe(100);
  });

  it('stays unique on a runtime without crypto.randomUUID', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });

    try {
      const keys = new Set(Array.from({ length: 100 }, randomIdempotencyKey));
      expect(keys.size).toBeGreaterThan(90);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('Transport.request', () => {
  it('unwraps the envelope', async () => {
    const source = stub([envelope({ id: 'msg_1' })]);

    await expect(
      transportFor(source).request({ method: 'GET', path: '/v1/messages/msg_1' })
    ).resolves.toEqual({ id: 'msg_1' });
  });

  it('sends the configured headers and accepts JSON', async () => {
    const source = stub([envelope({})]);

    await transportFor(source).request({ method: 'GET', path: '/v1/health' });

    expect(source.calls[0]?.headers).toMatchObject({
      accept: 'application/json',
      authorization: 'Bearer bk_ws_key',
    });
  });

  it('adds a content type only when there is a body', async () => {
    const source = stub([envelope({}), envelope({})]);
    const transport = transportFor(source);

    await transport.request({ method: 'GET', path: '/v1/health' });
    await transport.request({ method: 'POST', path: '/v1/messages', body: { title: 'Hi' } });

    expect(source.calls[0]?.headers['content-type']).toBeUndefined();
    expect(source.calls[1]?.headers['content-type']).toBe('application/json');
    expect(source.calls[1]?.body).toEqual({ title: 'Hi' });
  });

  it('serializes a query and skips absent values', async () => {
    const source = stub([envelope({})]);

    await transportFor(source).request({
      method: 'GET',
      path: '/v1/subscribers',
      query: { limit: 10, search: 'ada', cursor: undefined, topic: null, enabled: false },
    });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/subscribers?limit=10&search=ada&enabled=false');
  });

  it('omits the question mark when every value is absent', async () => {
    const source = stub([envelope({})]);

    await transportFor(source).request({ method: 'GET', path: '/v1/topics', query: { cursor: undefined } });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/topics');
  });

  it('passes an idempotency key as a header', async () => {
    const source = stub([envelope({})]);

    await transportFor(source).request({
      method: 'POST',
      path: '/v1/messages',
      body: {},
      idempotencyKey: 'key_1',
    });

    expect(source.calls[0]?.headers['idempotency-key']).toBe('key_1');
  });
});

describe('Transport.with', () => {
  it('adds a header without touching the original', async () => {
    const source = stub([envelope({}), envelope({})]);
    const base = transportFor(source);
    const scoped = base.with({ 'buzzkit-tenant': 'acme' });

    await scoped.request({ method: 'GET', path: '/v1/topics' });
    await base.request({ method: 'GET', path: '/v1/topics' });

    expect(source.calls[0]?.headers['buzzkit-tenant']).toBe('acme');
    expect(source.calls[1]?.headers['buzzkit-tenant']).toBeUndefined();
  });

  it('removes a header when given null', async () => {
    const source = stub([envelope({})]);

    await transportFor(source).with({ authorization: null }).request({ method: 'GET', path: '/v1/health' });

    expect(source.calls[0]?.headers.authorization).toBeUndefined();
  });
});

describe('Transport error mapping', () => {
  it('throws the mapped class with the API detail', async () => {
    const source = stub([failure(404, { code: 'not_found', message: 'Message not found', param: 'id' })]);

    const caught = await transportFor(source)
      .request<never>({ method: 'GET', path: '/v1/messages/msg_x' })
      .catch((error: NotFoundError) => error);

    expect(caught).toBeInstanceOf(NotFoundError);
    expect(caught.message).toBe('Message not found');
    expect(caught.code).toBe('not_found');
    expect(caught.param).toBe('id');
    expect(caught.requestId).toBe('req_stub');
  });

  it('throws on a 200 envelope that reports failure', async () => {
    const body = JSON.stringify({
      success: false,
      data: null,
      error: { code: 'conflict', message: 'Already exists' },
      metadata: { timestamp: 'x' },
    });
    const source = stub([
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    ]);

    await expect(transportFor(source).request({ method: 'POST', path: '/v1/topics' })).rejects.toThrow(
      'Already exists'
    );
  });

  it('reports a non-JSON error body without inventing a code', async () => {
    const source = stub([new Response('<html>502</html>', { status: 502 })]);

    const caught = await transportFor(source)
      .request<never>({ method: 'GET', path: '/v1/health' })
      .catch((error: ServerError) => error);

    expect(caught).toBeInstanceOf(ServerError);
    expect(caught.code).toBe('internal');
    expect(caught.message).toContain('502');
  });

  it('reports a success body that is not JSON as a parse failure', async () => {
    const source = stub([new Response('not json', { status: 200 })]);

    const caught = await transportFor(source)
      .request<never>({ method: 'GET', path: '/v1/health' })
      .catch((error: BuzzKitError) => error);

    expect(caught.code).toBe('parse');
    expect(caught.status).toBe(200);
  });

  it('wraps a network failure as a connection error', async () => {
    const source = stub([
      () => {
        throw new TypeError('fetch failed');
      },
    ]);

    const caught = await transportFor(source)
      .request<never>({ method: 'GET', path: '/v1/health' })
      .catch((error: ConnectionError) => error);

    expect(caught).toBeInstanceOf(ConnectionError);
    expect(caught.message).toContain('fetch failed');
  });

  it('wraps an abort as a timeout', async () => {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'TimeoutError';
    const source = stub([
      () => {
        throw aborted;
      },
    ]);

    await expect(transportFor(source).request({ method: 'GET', path: '/v1/health' })).rejects.toBeInstanceOf(
      TimeoutError
    );
  });

  it('times out a request that never settles', async () => {
    const source = stub([
      () =>
        new Promise<Response>(() => {
          return;
        }),
    ]);

    await expect(
      transportFor(source, { timeoutMs: 20 }).request({ method: 'GET', path: '/v1/health' })
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('Transport retries', () => {
  it('retries an idempotent method and returns the eventual success', async () => {
    const source = stub([
      failure(503, { code: 'unavailable' }, { 'retry-after': '0' }),
      envelope({ ok: true }),
    ]);

    await expect(
      transportFor(source, { maxRetries: 2 }).request({ method: 'GET', path: '/v1/health' })
    ).resolves.toEqual({ ok: true });
    expect(source.calls).toHaveLength(2);
  });

  it('stops after maxRetries and throws the last error', async () => {
    const responses = Array.from({ length: 3 }, () =>
      failure(429, { code: 'rate_limited' }, { 'retry-after': '0' })
    );
    const source = stub(responses);

    await expect(
      transportFor(source, { maxRetries: 2 }).request({ method: 'GET', path: '/v1/topics' })
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(source.calls).toHaveLength(3);
  });

  it('never retries a POST without an idempotency key', async () => {
    const source = stub([failure(503, { code: 'unavailable' }, { 'retry-after': '0' })]);

    await expect(
      transportFor(source, { maxRetries: 3 }).request({ method: 'POST', path: '/v1/subscriptions', body: {} })
    ).rejects.toBeInstanceOf(ServerError);
    expect(source.calls).toHaveLength(1);
  });

  it('retries a POST that carries an idempotency key', async () => {
    const source = stub([
      failure(503, { code: 'unavailable' }, { 'retry-after': '0' }),
      envelope({ id: 'm' }),
    ]);

    await transportFor(source, { maxRetries: 1 }).request({
      method: 'POST',
      path: '/v1/messages',
      body: {},
      idempotencyKey: 'key_1',
    });

    expect(source.calls).toHaveLength(2);
    expect(source.calls[1]?.headers['idempotency-key']).toBe('key_1');
  });

  it('never retries a permanent failure', async () => {
    const source = stub([failure(404, { code: 'not_found' })]);

    await expect(
      transportFor(source, { maxRetries: 3 }).request({ method: 'GET', path: '/v1/messages/msg_x' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(source.calls).toHaveLength(1);
  });

  it('retries a network failure', async () => {
    const source = stub([
      () => {
        throw new TypeError('fetch failed');
      },
      envelope({ ok: true }),
    ]);

    await expect(
      transportFor(source, { maxRetries: 1 }).request({ method: 'GET', path: '/v1/health' })
    ).resolves.toEqual({ ok: true });
  });

  it('waits the delay the server asked for', async () => {
    vi.useFakeTimers();

    const source = stub([
      failure(429, { code: 'rate_limited' }, { 'retry-after': '5' }),
      envelope({ ok: true }),
    ]);
    const pending = transportFor(source, { maxRetries: 1 }).request({ method: 'GET', path: '/v1/topics' });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(source.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ ok: true });

    vi.useRealTimers();
  });
});

describe('Transport cancellation', () => {
  it('aborts when the caller signal fires', async () => {
    const controller = new AbortController();
    const source = stub([
      () =>
        new Promise<Response>(() => {
          return;
        }),
    ]);

    const pending = transportFor(source).request({
      method: 'GET',
      path: '/v1/health',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(ConnectionError);
  });

  it('classifies and retries a body that dies after the headers arrived', async () => {
    let calls = 0;
    const transport = new Transport({
      baseUrl: 'https://api.test',
      headers: {},
      maxRetries: 2,
      timeoutMs: 1000,
      fetch: async () => {
        calls += 1;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException('The operation was aborted', 'TimeoutError'));
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await expect(transport.request({ method: 'GET', path: '/v1/health' })).rejects.toBeInstanceOf(
      TimeoutError
    );
    expect(calls).toBe(3);
  });

  it('reports a body that fails for any other reason as a connection failure', async () => {
    const transport = new Transport({
      baseUrl: 'https://api.test',
      headers: {},
      maxRetries: 0,
      timeoutMs: 1000,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('socket hang up'));
            },
          }),
          { status: 200 }
        ),
    });

    await expect(transport.request({ method: 'GET', path: '/v1/health' })).rejects.toThrowError(
      /response could not be read/
    );
  });

  it('hands back the server delay instead of blocking the caller for minutes', async () => {
    let calls = 0;
    const source = stub([
      () => {
        calls += 1;
        return failure(503, { code: 'unavailable', message: 'maintenance' }, { 'retry-after': '600' });
      },
    ]);
    const transport = new Transport({
      baseUrl: 'https://api.test',
      headers: {},
      maxRetries: 3,
      timeoutMs: 1000,
      fetch: source.fetch,
    });

    const caught = await transport
      .request({ method: 'GET', path: '/v1/health' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(calls).toBe(1);
    expect((caught as BuzzKitError).retryAfterSeconds).toBe(600);
    expect((caught as BuzzKitError).status).toBe(503);
  });
});
