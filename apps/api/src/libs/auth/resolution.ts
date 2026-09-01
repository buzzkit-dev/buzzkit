import { env } from 'cloudflare:workers';
import { type Actor, createAuditLogger } from '@buzzkit/api/api/audit/index';
import {
  hashApiKeySecret,
  keyKindOf,
  selectActiveApiKeyByHash,
  touchApiKey,
} from '@buzzkit/api/api/keys/index';
import { and, type Db, eq, isNull, tables } from '@buzzkit/database';
import { readCache, writeCache } from '../cache';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../error';
import { ROLE_SCOPES } from '../scopes';
import { trace } from '../telemetry';
import { authClient, SESSION_CACHE_TTL, sessionCacheKey } from './client';
import type { CachedSession, Session, User } from './types';

export const userMiddleware = (request: Request, db: Db) => {
  return trace('auth.userMiddleware', async (t) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      t.set('auth.error', 'missing_header');
      throw new UnauthorizedError('Missing authentication header', { code: 'missing_authorization' });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const cacheKey = await sessionCacheKey(token);
    const cached = await t.trace(
      'auth.cachedSession',
      async () => await readCache<CachedSession>(env.AUTH_CACHE, cacheKey)
    );
    if (cached && new Date(cached.session.expiresAt).getTime() > Date.now()) {
      t.set('cache.hit', true);
      return cached;
    }
    t.set('cache.hit', false);
    const session = await t.trace('auth.session', async () =>
      authClient(db).api.getSession({ headers: { Authorization: authHeader } })
    );
    if (!session) {
      t.set('auth.error', 'invalid_session');
      throw new UnauthorizedError('Invalid authentication session', { code: 'invalid_session' });
    }
    const result = { user: session.user, session: session.session };
    const secondsUntilExpiry = Math.floor((new Date(result.session.expiresAt).getTime() - Date.now()) / 1000);
    if (secondsUntilExpiry >= 60) {
      await t.trace('auth.cacheSession', async () =>
        writeCache(env.AUTH_CACHE, cacheKey, result, Math.min(SESSION_CACHE_TTL, secondsUntilExpiry))
      );
    }
    return result;
  });
};

export function resolveWorkspaceSlug(request: Request, params: Record<string, string>): string | null {
  return params.workspaceSlug ?? request.headers.get('buzzkit-workspace');
}

export const workspaceMiddleware = (request: Request, params: Record<string, string>, db: Db) => {
  return trace('auth.workspaceMiddleware', async (t) => {
    const auth = await userMiddleware(request, db);
    const slug = resolveWorkspaceSlug(request, params);
    if (!slug) {
      t.set('auth.error', 'missing_workspace_slug');
      throw new BadRequestError('Missing workspace identifier (path slug or buzzkit-workspace header)', {
        code: 'workspace_missing',
      });
    }
    t.set('workspace.slug', slug);
    const [result] = await t.trace('auth.membership', async () => {
      return await db
        .select({
          workspace: tables.workspace,
          membership: tables.workspaceMember,
        })
        .from(tables.workspace)
        .leftJoin(
          tables.workspaceMember,
          and(
            eq(tables.workspaceMember.workspaceId, tables.workspace.id),
            eq(tables.workspaceMember.userId, auth.user.id),
            isNull(tables.workspaceMember.deletedAt)
          )
        )
        .where(and(eq(tables.workspace.slug, slug), isNull(tables.workspace.deletedAt)));
    });
    if (!result?.workspace) {
      t.set('auth.error', 'workspace_not_found');
      throw new NotFoundError('Workspace not found');
    }
    if (!result.membership) {
      t.set('auth.error', 'not_a_member');
      throw new NotFoundError('Workspace not found');
    }
    const scopes: readonly string[] = ROLE_SCOPES[result.membership.role];
    t.set('workspace.id', result.workspace.id);
    t.set('membership.role', result.membership.role);
    const user = auth.user as User;
    const actor: Actor = { type: 'member', user, memberId: result.membership.id };
    return {
      user,
      session: auth.session as Session,
      workspace: result.workspace,
      membership: result.membership,
      apiKey: null,
      scopes,
      actor,
      audit: createAuditLogger(db, actor, request, result.workspace.id),
    };
  });
};

export const apiKeyMiddleware = (request: Request, params: Record<string, string>, db: Db) => {
  return trace('auth.apiKeyMiddleware', async (t) => {
    t.set('auth.method', 'api_key');
    const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const keyHash = await hashApiKeySecret(secret);
    const result = await t.trace('auth.apiKey', async () => selectActiveApiKeyByHash(db, keyHash));
    if (!result || keyKindOf(secret) !== result.key.kind) {
      t.set('auth.error', 'invalid_api_key');
      throw new UnauthorizedError('Invalid API key', { code: 'invalid_api_key' });
    }
    if (result.key.expiresAt && result.key.expiresAt.getTime() <= Date.now()) {
      t.set('auth.error', 'api_key_expired');
      throw new UnauthorizedError('API key expired', { code: 'api_key_expired' });
    }
    const slug = resolveWorkspaceSlug(request, params);
    if (slug && result.workspace.slug !== slug) {
      t.set('auth.error', 'api_key_wrong_workspace');
      throw new ForbiddenError('This API key belongs to a different workspace', { code: 'wrong_workspace' });
    }
    await t.trace('auth.touchApiKey', async () => touchApiKey(db, result.key));
    const scopes: readonly string[] = result.key.scopes;
    t.set('workspace.id', result.workspace.id);
    const actor: Actor = { type: 'key', apiKey: result.key };
    return {
      user: null,
      session: null,
      workspace: result.workspace,
      membership: null,
      apiKey: result.key,
      keyTenant: result.tenant,
      scopes,
      actor,
      audit: createAuditLogger(db, actor, request, result.workspace.id),
    };
  });
};
