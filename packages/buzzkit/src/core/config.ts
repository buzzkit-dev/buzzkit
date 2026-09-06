import { ConfigurationError } from './errors';

export const DEFAULT_BASE_URL = 'https://api.buzzkit.dev';

export const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_MAX_RETRIES = 2;

export const API_KEY_VARIABLE = 'BUZZKIT_API_KEY';

export function readEnvironment(name: string): string | undefined {
  const host = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return host.process?.env?.[name];
}

export function resolveBaseUrl(baseUrl: string | undefined): string {
  const resolved = baseUrl ?? readEnvironment('BUZZKIT_BASE_URL') ?? DEFAULT_BASE_URL;
  return resolved.endsWith('/') ? resolved.slice(0, -1) : resolved;
}

export function resolveFetch(fetcher: typeof globalThis.fetch | undefined): typeof globalThis.fetch {
  const resolved = fetcher ?? globalThis.fetch;
  if (typeof resolved !== 'function') {
    throw new ConfigurationError('No fetch implementation available — pass { fetch } to the BuzzKit client');
  }

  return resolved.bind(globalThis);
}
