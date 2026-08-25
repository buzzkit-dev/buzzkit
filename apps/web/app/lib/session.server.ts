import { SESSION_COOKIE_NAMES, sharedCookieDomain } from '@buzzkit/auth/cookies';
import { createAuthClient } from 'better-auth/client';
import { createCookie, redirect } from 'react-router';
import { requestUrl } from '@/app/lib/utils/request';

const lastWorkspace = createCookie('buzzkit.workspace', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
});

const tenantChoices = createCookie('buzzkit.tenants', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
});

export const DEFAULT_TENANT = 'default';

async function readTenantChoices(request: Request): Promise<Record<string, string>> {
  const value = await tenantChoices.parse(request.headers.get('Cookie'));
  return value && typeof value === 'object' ? (value as Record<string, string>) : {};
}

export async function resolveTenant(request: Request, workspaceSlug: string): Promise<string> {
  const requested = requestUrl(request).searchParams.get('tenant')?.trim();
  if (requested) return requested;
  return (await readTenantChoices(request))[workspaceSlug] ?? DEFAULT_TENANT;
}

export async function tenantCookie(
  env: Env,
  request: Request,
  workspaceSlug: string,
  tenantSlug: string
): Promise<string | null> {
  const choices = await readTenantChoices(request);
  if ((choices[workspaceSlug] ?? DEFAULT_TENANT) === tenantSlug) return null;
  const next = { ...choices, [workspaceSlug]: tenantSlug };
  if (tenantSlug === DEFAULT_TENANT) delete next[workspaceSlug];
  return tenantChoices.serialize(next, { secure: env.ENVIRONMENT !== 'development' });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function readSessionToken(request: Request): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = readCookie(request, name);
    if (value) return value;
  }
  return null;
}

export function safeRedirect(requested: string | null | undefined, fallback: string): string {
  return requested?.startsWith('/') && !requested.startsWith('//') ? requested : fallback;
}

export function requireSession(request: Request): { token: string } {
  const token = readSessionToken(request);
  if (token) return { token };
  const { pathname, search } = requestUrl(request);
  const back = pathname === '/' ? '' : `?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
  throw redirect(`/login${back}`);
}

const betterAuth = (env: Env) => createAuthClient({ baseURL: env.API_URL, basePath: '/v1/auth' });

export async function requireAnonymous(request: Request, env: Env): Promise<void> {
  const cookie = request.headers.get('Cookie');
  if (!cookie || !readSessionToken(request)) return;
  const { data } = await betterAuth(env).getSession({ fetchOptions: { headers: { cookie } } });
  if (data) throw redirect('/');
}

export function signedOutRedirect(request: Request, env: Env, redirectTo = '/login'): Response {
  const headers = new Headers({ location: redirectTo });
  const secure = env.ENVIRONMENT !== 'development';
  const shared = sharedCookieDomain(env.API_URL, new URL(request.url).origin);
  const domain = shared ? `; Domain=${shared}` : '';
  for (const name of SESSION_COOKIE_NAMES) {
    headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${domain}${secure ? '; Secure' : ''}`
    );
  }
  return new Response(null, { status: 302, headers });
}

export async function readLastWorkspace(request: Request): Promise<string | null> {
  const value = await lastWorkspace.parse(request.headers.get('Cookie'));
  return typeof value === 'string' ? value : null;
}

export function lastWorkspaceCookie(env: Env, slug: string): Promise<string> {
  return lastWorkspace.serialize(slug, { secure: env.ENVIRONMENT !== 'development' });
}

export async function signOut(request: Request, env: Env): Promise<Response> {
  const token = readSessionToken(request);
  if (!token) return signedOutRedirect(request, env, '/login');

  let cleared: string[] = [];
  await betterAuth(env).signOut({
    fetchOptions: {
      headers: { authorization: `Bearer ${token}`, origin: new URL(request.url).origin },
      onResponse: (context) => {
        cleared = context.response.headers.getSetCookie();
      },
    },
  });
  if (cleared.length === 0) return signedOutRedirect(request, env, '/login');

  const headers = new Headers({ location: '/login' });
  for (const cookie of cleared) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}
