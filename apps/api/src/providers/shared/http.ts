import { timedFetch } from '@buzzkit/api/libs/http';
import type { DeliveryErrorCode, ProviderResponse } from '../types';

export const PROVIDER_TIMEOUT_MS = 10_000;

export type ProviderHttpResult =
  | { ok: true; response: Response; captured: ProviderResponse; latencyMs: number }
  | { ok: false; code: 'timeout' | 'transport'; reason: string; latencyMs: number };

export async function providerFetch(url: string, init: RequestInit): Promise<ProviderHttpResult> {
  const result = await timedFetch(url, init, PROVIDER_TIMEOUT_MS);

  if (!result.ok) {
    return {
      ok: false,
      code: result.timedOut ? 'timeout' : 'transport',
      reason: result.reason,
      latencyMs: result.latencyMs,
    };
  }

  const captured: ProviderResponse = {
    status: result.response.status,
    body: parseBody(result.bodyExcerpt),
  };

  return { ok: true, response: result.response, captured, latencyMs: result.latencyMs };
}

export function classifyHttpStatus(status: number): DeliveryErrorCode {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'unknown';
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
