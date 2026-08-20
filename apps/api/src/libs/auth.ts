import { env } from 'cloudflare:workers';
import {
  type ApiKey,
  findActiveApiKeyByHash,
  hashApiKeySecret,
  isApiKeyToken,
  touchApiKey,
} from '@buzzkit/api/api/keys/index';
import { createBetterAuth } from '@buzzkit/auth';
import { and, createDrizzle, eq, type InferSelectModel, isNull, tables } from '@buzzkit/database';
import Elysia from 'elysia';
import { database } from './database';
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

const SESSION_CACHE_TTL = 300; // 5 minutes

export const authClient = (db?: ReturnType<typeof createDrizzle>) =>
  createBetterAuth({
    db: db ?? createDrizzle(env.HYPERDRIVE.connectionString),
    env: env,
    schema: tables.auth,
  });

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

const userMiddleware = (request: Request, db: ReturnType<typeof createDrizzle>) =>
  trace('auth.userMiddleware', async (t) => {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      t.set('auth.error', 'missing_header');
      throw new UnauthorizedError('Missing authentication header');
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const cacheKey = `session:${token.slice(-16)}`;

    const cached = await t.trace(
      'auth.getCachedSession',
      async () => await env.SESSION_CACHE?.get<CachedSession>(cacheKey, 'json')
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
      env.SESSION_CACHE?.put(cacheKey, JSON.stringify(result), {
        expirationTtl: SESSION_CACHE_TTL,
      })
    );

    return result;
  });

/**
 * The workspace a request addresses comes from the `:slug` path param on
 * `/v1/workspaces/:slug/*` routes. On slug-less routes (`/v1/tenants*`) an API
 * key implies its own workspace; session callers (the dashboard) pass the
 * `x-workspace` header instead.
 */
function resolveWorkspaceSlug(request: Request, params: Record<string, string>): string | null {
  return params.slug ?? request.headers.get('x-workspace');
}

const workspaceMiddleware = (
  request: Request,
  params: Record<string, string>,
  db: ReturnType<typeof createDrizzle>
) =>
  trace('auth.workspaceMiddleware', async (t) => {
    // Authenticate first — a missing credential is always a 401, regardless of
    // whether the request addressed a workspace correctly
    const auth = await userMiddleware(request, db);

    const slug = resolveWorkspaceSlug(request, params);

    if (!slug) {
      t.set('auth.error', 'missing_workspace_slug');
      throw new BadRequestError('Missing workspace identifier (path slug or x-workspace header)');
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

    return {
      user: auth.user as User,
      session: auth.session as Session,
      workspace: result.workspace,
      membership: result.membership,
      apiKey: null,
      scopes,
    };
  });

const apiKeyMiddleware = (
  request: Request,
  params: Record<string, string>,
  db: ReturnType<typeof createDrizzle>
) =>
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

    if (result.key.kind === 'tenant') {
      t.set('auth.error', 'tenant_key_on_workspace_route');
      throw new MissingPermissionError('This action requires a workspace API key');
    }

    const slug = resolveWorkspaceSlug(request, params);
    if (slug && result.workspace.slug !== slug) {
      t.set('auth.error', 'api_key_wrong_workspace');
      throw new ForbiddenError('This API key belongs to a different workspace');
    }

    await t.trace('auth.touchApiKey', async () => touchApiKey(db, result.key));

    const scopes: readonly string[] = result.key.scopes;

    t.set('workspace.id', result.workspace.id);

    return {
      user: null,
      session: null,
      workspace: result.workspace,
      membership: null,
      apiKey: result.key,
      scopes,
    };
  });

export const authHandler = new Elysia().mount('/v1/auth', async (request) => {
  const authLogContext = getAuthLogContext(request);

  try {
    const response = await authClient().handler(request);

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

/** Workspace-context scopes only — `account:*` uses the `account` macro instead. */
type WorkspaceScope = {
  [K in Scope]: (typeof SCOPES)[K] extends 'workspace' ? K : never;
}[Scope];

type AccountAction = 'read' | 'write';

/**
 * Unified context for workspace routes. Both middlewares must be assignable to
 * this single type — Elysia's resolve typing cannot handle a union.
 */
type WorkspaceAuth = {
  user: User | null;
  session: Session | null;
  workspace: Workspace;
  membership: WorkspaceMember | null;
  apiKey: ApiKey | null;
  scopes: readonly string[];
};

/**
 * The single authorization macro. Every route declares exactly one scope; the
 * scope's context decides how the request is authenticated:
 *  - user-context scopes ('account:*'): session bearer token; sessions
 *    implicitly hold all account scopes
 *  - workspace-context scopes: session membership or workspace API key; the
 *    workspace comes from `:slug`, the key itself, or `x-workspace`
 *
 * Resolution is per-request via `resolve` — auth context is injected into the
 * handler context, never shared between requests.
 */
export const auth = new Elysia({ name: 'auth/service' })
  .use(database)
  .macro({
    /**
     * Workspace routes: authenticates session membership or workspace API key
     * and enforces the scope. `workspace` is guaranteed; `user`, `membership`
     * and `apiKey` depend on the credential.
     */
    scope: (required: WorkspaceScope) => ({
      resolve: async ({ request, params, db }) => {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
        const isApiKey = isApiKeyToken(token);

        // Key management always requires a user session — even a '*' key is refused
        if (isApiKey && SESSION_ONLY_SCOPES.has(required)) {
          throw new MissingPermissionError(`The '${required}' scope requires a user session`);
        }

        const auth: WorkspaceAuth = isApiKey
          ? await apiKeyMiddleware(request, (params ?? {}) as Record<string, string>, db)
          : await workspaceMiddleware(request, (params ?? {}) as Record<string, string>, db);

        requireScope(auth.scopes, required);
        setAuthSpanAttributes(auth);

        return auth;
      },
    }),
    /**
     * Account routes (no workspace): session-only, `user` is guaranteed.
     */
    account: (access: AccountAction) => ({
      resolve: async ({ request, db }) => {
        const required: Scope = `account:${access}`;

        const session = await userMiddleware(request, db);
        requireScope(SESSION_SCOPES, required);
        setAuthSpanAttributes(session);

        return {
          user: session.user as User,
          session: session.session as Session,
          workspace: null,
          membership: null,
          apiKey: null,
          scopes: SESSION_SCOPES as readonly string[],
        };
      },
    }),
  })
  .as('scoped');
