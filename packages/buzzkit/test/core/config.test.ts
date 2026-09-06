import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, resolveBaseUrl, resolveFetch } from '../../src/core/config';
import { ConfigurationError } from '../../src/core/errors';

describe('resolveBaseUrl', () => {
  it('defaults to BuzzKit Cloud', () => {
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_BASE_URL);
  });

  it('trims a trailing slash so paths never double up', () => {
    expect(resolveBaseUrl('https://buzzkit.internal/')).toBe('https://buzzkit.internal');
    expect(resolveBaseUrl('https://buzzkit.internal')).toBe('https://buzzkit.internal');
  });

  it('keeps a base path', () => {
    expect(resolveBaseUrl('https://gateway.test/buzzkit/')).toBe('https://gateway.test/buzzkit');
  });
});

describe('resolveFetch', () => {
  it('falls back to the platform fetch', () => {
    expect(resolveFetch(undefined)).toBeTypeOf('function');
  });

  it('prefers the injected fetch', () => {
    const injected = (async () => new Response('{}')) as unknown as typeof globalThis.fetch;

    expect(resolveFetch(injected)).toBeTypeOf('function');
  });

  it('refuses a runtime with no usable fetch', () => {
    expect(() => resolveFetch('nope' as unknown as typeof globalThis.fetch)).toThrow(ConfigurationError);
  });
});
