type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type Stub = {
  calls: RecordedCall[];
  fetch: typeof globalThis.fetch;
};

export function envelope(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;

  return new Response(
    JSON.stringify({
      success: true,
      data,
      error: null,
      metadata: { timestamp: '2026-01-01T00:00:00.000Z', requestId: 'req_stub' },
    }),
    { status, headers: { 'content-type': 'application/json', 'request-id': 'req_stub', ...init.headers } }
  );
}

export function failure(
  status: number,
  error: { code: string; message?: string; param?: string; details?: unknown },
  headers: Record<string, string> = {}
) {
  return new Response(
    JSON.stringify({
      success: false,
      data: null,
      error: { message: `stub ${error.code}`, ...error },
      metadata: { timestamp: '2026-01-01T00:00:00.000Z' },
    }),
    { status, headers: { 'content-type': 'application/json', 'request-id': 'req_stub', ...headers } }
  );
}

export function page(items: unknown[], extra: { hasMore?: boolean; nextCursor?: string | null } = {}) {
  return envelope({
    items,
    hasMore: extra.hasMore ?? false,
    nextCursor: extra.nextCursor ?? null,
  });
}

export function stub(responses: Array<Response | (() => Response | Promise<Response>)>): Stub {
  const calls: RecordedCall[] = [];
  const queue = [...responses];

  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const raw = init?.body;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof raw === 'string' ? JSON.parse(raw) : undefined,
    });

    const next = queue.shift();
    if (!next) throw new Error(`No stub response left for ${init?.method ?? 'GET'} ${String(url)}`);

    const pending = typeof next === 'function' ? next() : next;
    const { signal } = init ?? {};
    if (!signal) return await pending;
    if (signal.aborted) throw signal.reason;

    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    ]);
  };

  return { calls, fetch: fetcher as unknown as typeof globalThis.fetch };
}
