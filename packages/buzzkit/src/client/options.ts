import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_MS, resolveBaseUrl, resolveFetch } from '../core/config';
import { ConfigurationError } from '../core/errors';
import { assertClientKey } from '../core/keys';
import { Transport } from '../core/transport';

export type Identity = {
  externalId: string;
  identityHash?: string;
};

export type BrowserOptions = {
  publishableKey: string;
  identity?: Identity;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
};

export type ResolvedBrowserOptions = {
  publishableKey: string;
  identity: Identity | null;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  headers: Record<string, string>;
  fetch: typeof globalThis.fetch;
};

export function resolveBrowserOptions(options: BrowserOptions): ResolvedBrowserOptions {
  if (!options.publishableKey) {
    throw new ConfigurationError('Missing publishable key — pass { publishableKey } to the BuzzKit client');
  }

  assertClientKey(options.publishableKey);

  return {
    publishableKey: options.publishableKey,
    identity: options.identity ?? null,
    baseUrl: resolveBaseUrl(options.baseUrl),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    headers: options.headers ?? {},
    fetch: resolveFetch(options.fetch),
  };
}

function identityHeaders(identity: Identity | null): Record<string, string> {
  if (!identity) return {};

  return {
    'buzzkit-subscriber': identity.externalId,
    ...(identity.identityHash ? { 'buzzkit-identity': identity.identityHash } : {}),
  };
}

export function browserTransport(options: ResolvedBrowserOptions): Transport {
  return new Transport({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    fetch: options.fetch,
    headers: {
      ...options.headers,
      authorization: `Bearer ${options.publishableKey}`,
      ...identityHeaders(options.identity),
    },
  });
}
