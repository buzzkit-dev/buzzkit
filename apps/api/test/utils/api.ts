export const BASE_URL = process.env.API_URL ?? 'http://localhost:8790';

export type Envelope<T = unknown> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  metadata: { timestamp: number };
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
  return { status: response.status, body };
}
