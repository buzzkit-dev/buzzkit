import {
  API_KEY_VARIABLE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  readEnvironment,
  resolveBaseUrl,
  resolveFetch,
} from '../core/config';
import { ConfigurationError } from '../core/errors';
import { assertServerKey } from '../core/keys';
import { Transport } from '../core/transport';

export type ClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  tenant?: string;
  workspace?: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
};

export type ResolvedOptions = {
  apiKey: string;
  baseUrl: string;
  tenant: string | null;
  workspace: string | null;
  timeoutMs: number;
  maxRetries: number;
  headers: Record<string, string>;
  fetch: typeof globalThis.fetch;
};

export function resolveOptions(options: ClientOptions): ResolvedOptions {
  const apiKey = options.apiKey ?? readEnvironment(API_KEY_VARIABLE);
  if (!apiKey) {
    throw new ConfigurationError(
      `Missing API key — pass { apiKey } to the BuzzKit client or set ${API_KEY_VARIABLE}`
    );
  }

  assertServerKey(apiKey);

  return {
    apiKey,
    baseUrl: resolveBaseUrl(options.baseUrl),
    tenant: options.tenant ?? null,
    workspace: options.workspace ?? null,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    headers: options.headers ?? {},
    fetch: resolveFetch(options.fetch),
  };
}

export function serverTransport(options: ResolvedOptions): Transport {
  return new Transport({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    fetch: options.fetch,
    headers: {
      ...options.headers,
      authorization: `Bearer ${options.apiKey}`,
      ...(options.tenant ? { 'buzzkit-tenant': options.tenant } : {}),
      ...(options.workspace ? { 'buzzkit-workspace': options.workspace } : {}),
    },
  });
}
