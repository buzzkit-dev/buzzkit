import { createAuthClient } from 'better-auth/client';

let client: ReturnType<typeof createAuthClient> | undefined;

export function authClient(apiUrl: string) {
  client ??= createAuthClient({ baseURL: apiUrl, basePath: '/v1/auth' });
  return client;
}

export type AuthFailure = { code?: string; message?: string } | null | undefined;
