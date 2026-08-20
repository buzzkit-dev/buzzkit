import { env } from 'cloudflare:workers';
import { type Actor, createEventLogger, type EventFn } from '@buzzkit/api/api/events/index';
import {
  type ApiKey,
  findActiveApiKeyByHash,
  hashApiKeySecret,
  isApiKeyToken,
  isClientKeyToken,
  touchApiKey,
} from '@buzzkit/api/api/keys/index';
import { findTenantBySlug, type Tenant } from '@buzzkit/api/api/tenants/index';
import { createBetterAuth } from '@buzzkit/auth';
import { and, type Db, eq, type InferSelectModel, isNull, tables } from '@buzzkit/database';
import { instrumentBetterAuth } from '@kubiks/otel-better-auth';
import Elysia from 'elysia';
import { createDb, database } from './database';
import {
  BadRequestError,
  ForbiddenError,
  MissingPermissionError,
  NotFoundError,
  UnauthorizedError,
} from './error';
import { log } from './logger';
import {
  ROLE_SCOPES,
  requireScope,
  type SCOPES,
  type Scope,
  SESSION_ONLY_SCOPES,
  SESSION_SCOPES,
} from './scopes';
import { setAuthSpanAttributes, trace } from './telemetry';

type User = InferSelectModel<typeof tables.auth.user>;
type Session = InferSelectModel<typeof tables.auth.session>;
type Workspace = InferSelectModel<typeof tables.workspace>;
type WorkspaceMember = InferSelectModel<typeof tables.workspaceMember>;

type CachedSession = {
  user: User;
  session: Session;
};

const AUTH_CACHE_TTL = 300;

const sessionCacheKey = (token: string) => `session:${token.slice(-16)}`;

export const authClient = (db?: Db) => {
  const auth = createBetterAuth({ db: db ?? createDb(), env, schema: tables.auth });
  return instrumentBetterAuth(auth as unknown as Parameters<typeof instrumentBetterAuth>[0]) as typeof auth;
};

function getAuthLogContext(request: Request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    host: url.host,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    hasCookie: request.headers.has('cookie'),
    hasAuthorization: request.headers.has('authorization'),
    userAgent: request.headers.get('user-agent'),
  };
}

const userMiddleware = (request: Request, db: Db) =>
  trace('auth.userMiddleware', async (t) => {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      t.set('auth.error', 'missing_header');
      throw new UnauthorizedError('Missing authentication header');
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const cacheKey = sessionCacheKey(token);

    const cached = await t.trace(
      'auth.getCachedSession',
      async () => await env.AUTH_CACHE?.get<CachedSession>(cacheKey, 'json')
    );

    if (cached) {
      t.set('cache.hit', true);
      return cached;
    }

    t.set('cache.hit', false);

    const session = await t.trace('auth.getSession', async () =>
      authClient(db).api.getSession({ headers: { Authorization: authHeader } })
    );

    if (!session) {
      t.set('auth.error', 'invalid_session');
      throw new UnauthorizedError('Invalid authentication session');
    }

    const result = { user: session.user, session: session.session };

    await t.trace('auth.cacheSession', async () =>
      env.AUTH_CACHE?.put(cacheKey, JSON.stringify(result), {
        expirationTtl: AUTH_CACHE_TTL,
      })
    );

    return result;
  });

function resolveWorkspaceSlug(request: Request, params: Record<string, string>): string | null {
  return params.slug ?? request.headers.get('buzzkit-workspace');
}

const workspaceMiddleware = (request: Request, params: Record<string, string>, db: Db) =>
  trace('auth.workspaceMiddleware', async (t) => {
    const auth = await userMiddleware(request, db);

    const slug = resolveWorkspaceSlug(request, params);

    if (!slug) {
      t.set('auth.error', 'missing_workspace_slug');
      throw new BadRequestError('Missing workspace identifier (path slug or buzzkit-workspace header)');
    }

    t.set('workspace.slug', slug);

    const [result] = await t.trace('auth.getMembership', async () =>
      db
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
        .where(and(eq(tables.workspace.slug, slug), isNull(tables.workspace.deletedAt)))
    );

    if (!result?.workspace) {
      t.set('auth.error', 'workspace_not_found');
      throw new NotFoundError('Workspace not found');
    }

    if (!result.membership) {
      t.set('auth.error', 'not_a_member');
      throw new ForbiddenError('You are not a member of this workspace');
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
      event: createEventLogger(db, actor, request, result.workspace.id),
    };
  });

const apiKeyMiddleware = (request: Request, params: Record<string, string>, db: Db) =>
  trace('auth.apiKeyMiddleware', async (t) => {
    t.set('auth.method', 'api_key');

    const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const keyHash = await hashApiKeySecret(secret);

    const result = await t.trace('auth.getApiKey', async () => findActiveApiKeyByHash(db, keyHash));

    if (!result) {
      t.set('auth.error', 'invalid_api_key');
      throw new UnauthorizedError('Invalid API key');
    }

    if (result.key.expiresAt && result.key.expiresAt.getTime() <= Date.now()) {
      t.set('auth.error', 'api_key_expired');
      throw new UnauthorizedError('API key expired');
    }

    const slug = resolveWorkspaceSlug(request, params);
    if (slug && result.workspace.slug !== slug) {
      t.set('auth.error', 'api_key_wrong_workspace');
      throw new ForbiddenError('This API key belongs to a different workspace');
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
      event: createEventLogger(db, actor, request, result.workspace.id),
    };
  });

export const authHandler = new Elysia().mount('/v1/auth', async (request) => {
  const authLogContext = getAuthLogContext(request);

  try {
    const response = await authClient().handler(request);

    if (response.ok && new URL(request.url).pathname.endsWith('/sign-out')) {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (token) {
        await env.AUTH_CACHE?.delete(sessionCacheKey(token));
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
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

type WorkspaceScope = {
  [K in Scope]: (typeof SCOPES)[K] extends 'workspace' ? K : never;
}[Scope];

type TenantScope = {
  [K in Scope]: (typeof SCOPES)[K] extends 'tenant' ? K : never;
}[Scope];

type AccountAction = 'read' | 'write';

type WorkspaceAuth = {
  user: User | null;
  session: Session | null;
  workspace: Workspace;
  membership: WorkspaceMember | null;
  apiKey: ApiKey | null;
  scopes: readonly string[];
  actor: Actor;
  event: EventFn;
};

type TenantAuth = WorkspaceAuth & { tenant: Tenant };

export const auth = new Elysia({ name: 'auth/service' })
  .use(database)
  .macro({
    scope: (required: WorkspaceScope) => ({
      resolve: async ({ request, params, db }) => {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
        const isApiKey = isApiKeyToken(token);

        if (isApiKey && SESSION_ONLY_SCOPES.has(required)) {
          throw new MissingPermissionError(`The '${required}' scope requires a user session`);
        }

        const auth: WorkspaceAuth = isApiKey
          ? await apiKeyMiddleware(request, (params ?? {}) as Record<string, string>, db)
          : await workspaceMiddleware(request, (params ?? {}) as Record<string, string>, db);

        if (auth.apiKey?.kind === 'tenant') {
          throw new MissingPermissionError('This action requires a workspace API key');
        }

        requireScope(auth.scopes, required);
        setAuthSpanAttributes(auth);

        return auth;
      },
    }),
    tenant: (required: TenantScope) => ({
      resolve: async ({ request, params, db }) => {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
        const isApiKey = isApiKeyToken(token);

        const base = isApiKey
          ? await apiKeyMiddleware(request, (params ?? {}) as Record<string, string>, db)
          : await workspaceMiddleware(request, (params ?? {}) as Record<string, string>, db);

        const requestedSlug = request.headers.get('buzzkit-tenant');

        let tenant: Tenant;
        if ('keyTenant' in base && base.keyTenant) {
          if (requestedSlug && requestedSlug !== base.keyTenant.slug) {
            throw new ForbiddenError('This API key belongs to a different tenant');
          }
          tenant = base.keyTenant;
        } else {
          tenant = await findTenantBySlug(db, base.workspace.id, requestedSlug ?? 'default');
        }

        requireScope(base.scopes, required);

        const auth: TenantAuth = { ...(base as WorkspaceAuth), tenant };
        setAuthSpanAttributes(auth);
        return auth;
      },
    }),
    client: (enabled: true) => ({
      resolve: async ({ request, db }) => {
        if (!enabled) throw new UnauthorizedError('Client authentication required');

        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

        if (!isClientKeyToken(token)) {
          throw new UnauthorizedError('Client endpoints require a client key (bk_pk_…)');
        }

        return await trace('auth.clientMiddleware', async (t) => {
          const keyHash = await hashApiKeySecret(token);
          const result = await findActiveApiKeyByHash(db, keyHash);

          if (result?.key.kind !== 'client' || !result.tenant) {
            t.set('auth.error', 'invalid_client_key');
            throw new UnauthorizedError('Invalid client key');
          }

          const requestedTenant = request.headers.get('buzzkit-tenant');
          if (requestedTenant && requestedTenant !== result.tenant.slug) {
            t.set('auth.error', 'client_key_wrong_tenant');
            throw new ForbiddenError('This client key belongs to a different tenant');
          }

          await touchApiKey(db, result.key);

          t.set('workspace.id', result.workspace.id);
          t.set('auth.method', 'client_key');
          setAuthSpanAttributes({ apiKey: result.key, workspace: result.workspace, tenant: result.tenant });

          const clientEvent = (display: string) =>
            createEventLogger(db, { type: 'user', subscriber: { display } }, request, result.workspace.id);

          return {
            workspace: result.workspace,
            tenant: result.tenant as Tenant,
            apiKey: result.key,
            clientEvent,
          };
        });
      },
    }),
    account: (access: AccountAction) => ({
      resolve: async ({ request, db }) => {
        const required: Scope = `account:${access}`;

        const session = await userMiddleware(request, db);
        requireScope(SESSION_SCOPES, required);
        setAuthSpanAttributes(session);

        const user = session.user as User;
        const actor: Actor = { type: 'member', user };

        return {
          user,
          session: session.session as Session,
          workspace: null,
          membership: null,
          apiKey: null,
          scopes: SESSION_SCOPES as readonly string[],
          actor,
          event: createEventLogger(db, actor, request, null),
        };
      },
    }),
  })
  .as('scoped');
