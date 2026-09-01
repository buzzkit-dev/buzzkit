export const FETCH_BODY_EXCERPT_CHARS = 4096;

export type TimedFetchResult =
  | { ok: true; response: Response; bodyExcerpt: string; latencyMs: number }
  | { ok: false; timedOut: boolean; reason: string; latencyMs: number };

export async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<TimedFetchResult> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const bodyExcerpt = (await response.clone().text()).slice(0, FETCH_BODY_EXCERPT_CHARS);
    return { ok: true, response, bodyExcerpt, latencyMs: Date.now() - startedAt };
  } catch (caught) {
    const timedOut =
      caught instanceof Error && (caught.name === 'TimeoutError' || caught.name === 'AbortError');

    return {
      ok: false,
      timedOut,
      reason: timedOut
        ? `no response within ${timeoutMs}ms`
        : caught instanceof Error
          ? caught.message
          : String(caught),
      latencyMs: Date.now() - startedAt,
    };
  }
}
