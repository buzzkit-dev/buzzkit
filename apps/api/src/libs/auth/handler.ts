import { env } from 'cloudflare:workers';
import Elysia from 'elysia';
import { deleteCache } from '../cache';
import { describeError } from '../error';
import { log } from '../logger';
import { authClient, sessionCacheKey } from './client';

function describeAuthRequest(request: Request) {
  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
    host: url.host,
    origin: request.headers.get('origin'),
    hasCookie: request.headers.has('cookie'),
    hasAuthorization: request.headers.has('authorization'),
    userAgent: request.headers.get('user-agent'),
  };
}

function withBetterAuthBasePath(request: Request): Request {
  const url = new URL(request.url);
  const basePath = new URL(env.BETTER_AUTH_URL).pathname.replace(/\/$/, '');
  if (!basePath) return request;
  return new Request(`${url.origin}${basePath}${url.pathname}${url.search}`, request);
}

export const authHandler = new Elysia().mount('/v1/auth', async (request) => {
  const authLogContext = describeAuthRequest(request);

  try {
    const response = await authClient().handler(withBetterAuthBasePath(request));

    if (response.ok && new URL(request.url).pathname.endsWith('/sign-out')) {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (token) {
        await deleteCache(env.AUTH_CACHE, [await sessionCacheKey(token)]);
      }
    }

    if (response.status >= 400) {
      const responseBody = await response
        .clone()
        .text()
        .then((body) => body.slice(0, 1000))
        .catch(() => undefined);
      log.error('[Auth] Request failed', {
        ...authLogContext,
        status: response.status,
        responseBody,
      });
    }

    return response;
  } catch (error) {
    log.error('[Auth] Handler threw', {
      ...authLogContext,
      error: describeError(error),
    });
    throw error;
  }
});
