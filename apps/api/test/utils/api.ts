export const BASE_URL = process.env.API_URL ?? 'http://localhost:8790';

export type Envelope<T = unknown> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; param?: string; details?: unknown } | null;
  metadata: { timestamp: string; requestId?: string };
};

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: Envelope<T> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const body = (await response.json()) as Envelope<T>;
  return { status: response.status, headers: response.headers, body };
}
