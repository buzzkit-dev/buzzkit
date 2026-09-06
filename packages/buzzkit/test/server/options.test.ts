import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../src/core/errors';
import { resolveOptions, serverTransport } from '../../src/server/options';
import { envelope, stub } from '../utils/stub';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('resolveOptions', () => {
  it('requires an API key', () => {
    process.env.BUZZKIT_API_KEY = undefined;
    delete process.env.BUZZKIT_API_KEY;

    expect(() => resolveOptions({})).toThrow(ConfigurationError);
    expect(() => resolveOptions({})).toThrow(/BUZZKIT_API_KEY/);
  });

  it('falls back to the environment', () => {
    process.env.BUZZKIT_API_KEY = 'bk_ws_from_env';

    expect(resolveOptions({}).apiKey).toBe('bk_ws_from_env');
  });

  it('prefers an explicit key over the environment', () => {
    process.env.BUZZKIT_API_KEY = 'bk_ws_from_env';

    expect(resolveOptions({ apiKey: 'bk_ws_explicit' }).apiKey).toBe('bk_ws_explicit');
  });

  it('refuses a client key', () => {
    expect(() => resolveOptions({ apiKey: 'bk_pk_public' })).toThrow(ConfigurationError);
  });

  it('applies the documented defaults', () => {
    const resolved = resolveOptions({ apiKey: 'bk_ws_k' });

    expect(resolved.baseUrl).toBe('https://api.buzzkit.dev');
    expect(resolved.timeoutMs).toBe(30_000);
    expect(resolved.maxRetries).toBe(2);
    expect(resolved.tenant).toBeNull();
    expect(resolved.workspace).toBeNull();
  });

  it('reads a base URL from the environment and trims a trailing slash', () => {
    process.env.BUZZKIT_API_KEY = 'bk_ws_k';
    process.env.BUZZKIT_BASE_URL = 'https://buzzkit.internal/';

    expect(resolveOptions({}).baseUrl).toBe('https://buzzkit.internal');
    expect(resolveOptions({ baseUrl: 'https://other.test/' }).baseUrl).toBe('https://other.test');
  });
});

describe('serverTransport', () => {
  it('sends the bearer token and no scope headers by default', async () => {
    const source = stub([envelope({})]);
    const transport = serverTransport(
      resolveOptions({ apiKey: 'bk_ws_k', baseUrl: 'https://api.test', fetch: source.fetch })
    );

    await transport.request({ method: 'GET', path: '/v1/health' });

    expect(source.calls[0]?.headers.authorization).toBe('Bearer bk_ws_k');
    expect(source.calls[0]?.headers['buzzkit-tenant']).toBeUndefined();
    expect(source.calls[0]?.headers['buzzkit-workspace']).toBeUndefined();
  });

  it('sends the configured tenant and workspace', async () => {
    const source = stub([envelope({})]);
    const transport = serverTransport(
      resolveOptions({
        apiKey: 'bk_ws_k',
        baseUrl: 'https://api.test',
        tenant: 'acme',
        workspace: 'studio',
        fetch: source.fetch,
      })
    );

    await transport.request({ method: 'GET', path: '/v1/health' });

    expect(source.calls[0]?.headers['buzzkit-tenant']).toBe('acme');
    expect(source.calls[0]?.headers['buzzkit-workspace']).toBe('studio');
  });

  it('keeps caller headers but never lets them replace the credential', async () => {
    const source = stub([envelope({})]);
    const transport = serverTransport(
      resolveOptions({
        apiKey: 'bk_ws_k',
        baseUrl: 'https://api.test',
        headers: { 'x-trace': 'abc', authorization: 'Bearer spoofed' },
        fetch: source.fetch,
      })
    );

    await transport.request({ method: 'GET', path: '/v1/health' });

    expect(source.calls[0]?.headers['x-trace']).toBe('abc');
    expect(source.calls[0]?.headers.authorization).toBe('Bearer bk_ws_k');
  });
});
