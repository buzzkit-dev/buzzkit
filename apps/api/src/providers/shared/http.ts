import type { ProviderResponse } from '../types';

export const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_CAPTURED_BODY_CHARS = 4096;

export type ProviderHttpResult =
  | { ok: true; response: Response; captured: ProviderResponse; latencyMs: number }
  | { ok: false; code: 'timeout' | 'transport'; reason: string; latencyMs: number };

export async function providerFetch(url: string, init: RequestInit): Promise<ProviderHttpResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.clone().text();
    const captured: ProviderResponse = {
      status: response.status,
      body: parseBody(text.slice(0, MAX_CAPTURED_BODY_CHARS)),
    };
    return { ok: true, response, captured, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'timeout' : 'transport',
      reason: aborted
        ? `no response within ${PROVIDER_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, Math.floor(seconds));
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(1, Math.ceil((date - Date.now()) / 1000));
}
