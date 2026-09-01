import { type Actor, createAuditLogger } from '@buzzkit/api/api/audit/index';
import {
  hashApiKeySecret,
  isApiKeyToken,
  isClientKeyToken,
  selectActiveApiKeyByHash,
  touchApiKey,
} from '@buzzkit/api/api/keys/index';
import { findTenantBySlug, type Tenant } from '@buzzkit/api/api/tenants/index';
import Elysia from 'elysia';
import { database } from '../database';
import { ForbiddenError, MissingPermissionError, UnauthorizedError } from '../error';
import { requireScope, type Scope, SESSION_ONLY_SCOPES, SESSION_SCOPES } from '../scopes';
import { applyAuthSpanAttributes, trace } from '../telemetry';
import { apiKeyMiddleware, userMiddleware, workspaceMiddleware } from './resolution';
import type {
  AccountAction,
  Session,
  TenantAuth,
  TenantScope,
  User,
  WorkspaceAuth,
  WorkspaceScope,
} from './types';

export { authClient } from './client';
export { authHandler } from './handler';

export const auth = new Elysia({ name: 'auth/service' })
  .use(database)
  .macro({
    scope: (required: WorkspaceScope) => {
      return {
        resolve: async ({ request, params, db }) => {
          const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
          const isApiKey = isApiKeyToken(token);

          if (isApiKey && SESSION_ONLY_SCOPES.has(required)) {
            throw new MissingPermissionError(`The '${required}' scope requires a user session`);
          }

          let resolved: WorkspaceAuth;
          if (isApiKey) {
            resolved = await apiKeyMiddleware(request, (params ?? {}) as Record<string, string>, db);
          } else {
            resolved = await workspaceMiddleware(request, (params ?? {}) as Record<string, string>, db);
          }

          if (resolved.apiKey?.kind === 'tenant') {
            throw new MissingPermissionError('This action requires a workspace API key');
          }

          requireScope(resolved.scopes, required);
          applyAuthSpanAttributes(resolved);

          return resolved;
        },
      };
    },
    tenant: (required: TenantScope) => {
      return {
        resolve: async ({ request, params, db }) => {
          const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
          const isApiKey = isApiKeyToken(token);

          if (isApiKey && SESSION_ONLY_SCOPES.has(required)) {
            throw new MissingPermissionError(`The '${required}' scope requires a user session`);
          }

          let base: Awaited<ReturnType<typeof apiKeyMiddleware> | ReturnType<typeof workspaceMiddleware>>;
          if (isApiKey) {
            base = await apiKeyMiddleware(request, (params ?? {}) as Record<string, string>, db);
          } else {
            base = await workspaceMiddleware(request, (params ?? {}) as Record<string, string>, db);
          }

          const requestedSlug = request.headers.get('buzzkit-tenant');

          let tenant: Tenant;
          if ('keyTenant' in base && base.keyTenant) {
            if (requestedSlug && requestedSlug !== base.keyTenant.slug) {
              throw new ForbiddenError('This API key belongs to a different tenant', {
                code: 'wrong_tenant',
              });
            }
            tenant = base.keyTenant;
          } else {
            tenant = await findTenantBySlug(db, base.workspace.id, requestedSlug ?? 'default');
          }

          requireScope(base.scopes, required);

          const resolved: TenantAuth = { ...(base as WorkspaceAuth), tenant };
          applyAuthSpanAttributes(resolved);

          return resolved;
        },
      };
    },
    client: (enabled: true) => {
      return {
        resolve: async ({ request, db }) => {
          if (!enabled) throw new UnauthorizedError('Client authentication required');

          const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

          if (!isClientKeyToken(token)) {
            throw new UnauthorizedError('Client endpoints require a client key (bk_pk_…)', {
              code: 'client_key_required',
            });
          }

          return await trace('auth.clientMiddleware', async (t) => {
            const keyHash = await hashApiKeySecret(token);
            const result = await selectActiveApiKeyByHash(db, keyHash);

            if (result?.key.kind !== 'client' || !result.tenant) {
              t.set('auth.error', 'invalid_client_key');
              throw new UnauthorizedError('Invalid client key', { code: 'invalid_api_key' });
            }

            const requestedTenant = request.headers.get('buzzkit-tenant');
            if (requestedTenant && requestedTenant !== result.tenant.slug) {
              t.set('auth.error', 'client_key_wrong_tenant');
              throw new ForbiddenError('This client key belongs to a different tenant', {
                code: 'wrong_tenant',
              });
            }

            await touchApiKey(db, result.key);

            t.set('workspace.id', result.workspace.id);
            t.set('auth.method', 'client_key');
            applyAuthSpanAttributes({
              apiKey: result.key,
              workspace: result.workspace,
              tenant: result.tenant,
            });

            return {
              workspace: result.workspace,
              tenant: result.tenant as Tenant,
              apiKey: result.key,
            };
          });
        },
      };
    },
    account: (access: AccountAction) => {
      return {
        resolve: async ({ request, db }) => {
          const required: Scope = `account:${access}`;

          const session = await userMiddleware(request, db);
          requireScope(SESSION_SCOPES, required);
          applyAuthSpanAttributes(session);

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
            audit: createAuditLogger(db, actor, request, null),
          };
        },
      };
    },
  })
  .as('scoped');
