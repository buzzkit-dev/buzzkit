import { BadRequestError, MissingPermissionError } from './error';

type ScopeDefinition = {
  context: 'user' | 'workspace' | 'tenant';
  role: 'member' | 'admin' | 'owner' | null;
  key: boolean;
};

export const SCOPE_CATALOG = {
  'account:read': { context: 'user', role: null, key: false },
  'account:write': { context: 'user', role: null, key: false },

  'workspace:read': { context: 'workspace', role: 'member', key: true },
  'workspace:write': { context: 'workspace', role: 'admin', key: true },
  'workspace:delete': { context: 'workspace', role: 'owner', key: false },

  'members:read': { context: 'workspace', role: 'member', key: true },
  'members:write': { context: 'workspace', role: 'admin', key: false },

  'invites:read': { context: 'workspace', role: 'admin', key: false },
  'invites:write': { context: 'workspace', role: 'admin', key: false },

  'keys:read': { context: 'workspace', role: 'member', key: false },
  'keys:write': { context: 'workspace', role: 'admin', key: false },

  'tenants:read': { context: 'workspace', role: 'member', key: true },
  'tenants:write': { context: 'workspace', role: 'admin', key: true },
  'tenants:secrets': { context: 'workspace', role: 'admin', key: false },

  'audit:read': { context: 'workspace', role: 'admin', key: true },

  'webhooks:read': { context: 'workspace', role: 'member', key: true },
  'webhooks:write': { context: 'workspace', role: 'admin', key: true },

  'events:read': { context: 'tenant', role: 'member', key: true },
  'events:write': { context: 'tenant', role: 'member', key: true },

  'credentials:read': { context: 'tenant', role: 'member', key: true },
  'credentials:write': { context: 'tenant', role: 'admin', key: true },

  'subscribers:read': { context: 'tenant', role: 'member', key: true },
  'subscribers:write': { context: 'tenant', role: 'member', key: true },

  'subscriptions:read': { context: 'tenant', role: 'member', key: true },
  'subscriptions:write': { context: 'tenant', role: 'member', key: true },

  'segments:read': { context: 'tenant', role: 'member', key: true },
  'segments:write': { context: 'tenant', role: 'admin', key: true },

  'workflows:read': { context: 'tenant', role: 'member', key: true },
  'workflows:write': { context: 'tenant', role: 'admin', key: true },

  'topics:read': { context: 'tenant', role: 'member', key: true },
  'topics:write': { context: 'tenant', role: 'admin', key: true },

  'messages:read': { context: 'tenant', role: 'member', key: true },
  'messages:send': { context: 'tenant', role: 'member', key: true },
} as const satisfies Record<string, ScopeDefinition>;

export type Scope = keyof typeof SCOPE_CATALOG;

export type AuthRole = 'owner' | 'admin' | 'member';

const ALL_SCOPES = Object.keys(SCOPE_CATALOG) as Scope[];
const WORKSPACE_SCOPES = ALL_SCOPES.filter((scope) => SCOPE_CATALOG[scope].context === 'workspace');
const TENANT_SCOPES = ALL_SCOPES.filter((scope) => SCOPE_CATALOG[scope].context === 'tenant');
const GRANTED_SCOPES = [...WORKSPACE_SCOPES, ...TENANT_SCOPES];

export const SESSION_SCOPES: readonly Scope[] = ALL_SCOPES.filter(
  (scope) => SCOPE_CATALOG[scope].context === 'user'
);

const bundle = (role: 'member' | 'admin' | 'owner') =>
  GRANTED_SCOPES.filter((scope) => SCOPE_CATALOG[scope].role === role);

const MEMBER_SCOPES = bundle('member');
const ADMIN_SCOPES = [...MEMBER_SCOPES, ...bundle('admin')];
const OWNER_SCOPES = [...ADMIN_SCOPES, ...bundle('owner')];

export const ROLE_SCOPES: Record<AuthRole, readonly Scope[]> = {
  member: MEMBER_SCOPES,
  admin: ADMIN_SCOPES,
  owner: OWNER_SCOPES,
};

export const SESSION_ONLY_SCOPES: ReadonlySet<Scope> = new Set(
  GRANTED_SCOPES.filter((scope) => !SCOPE_CATALOG[scope].key)
);

export const KEY_GRANTABLE_SCOPES: readonly Scope[] = GRANTED_SCOPES.filter(
  (scope) => SCOPE_CATALOG[scope].key
);

export const TENANT_KEY_GRANTABLE_SCOPES: readonly Scope[] = TENANT_SCOPES.filter(
  (scope) => SCOPE_CATALOG[scope].key
);

const grantableResources = (scopes: readonly Scope[]): ReadonlySet<string> =>
  new Set(scopes.map((scope) => scope.split(':')[0] as string));

const KEY_GRANTABLE_RESOURCES = grantableResources(KEY_GRANTABLE_SCOPES);
const TENANT_KEY_GRANTABLE_RESOURCES = grantableResources(TENANT_KEY_GRANTABLE_SCOPES);

export function hasScope(granted: readonly string[], required: Scope): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;

  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

export function requireScope(granted: readonly string[], required: Scope): void {
  if (!hasScope(granted, required)) {
    throw new MissingPermissionError(`This action requires the '${required}' scope`);
  }
}

export function assertValidKeyScopes(scopes: readonly string[], kind: 'workspace' | 'tenant'): void {
  const grantable: readonly string[] = kind === 'tenant' ? TENANT_KEY_GRANTABLE_SCOPES : KEY_GRANTABLE_SCOPES;
  const resources = kind === 'tenant' ? TENANT_KEY_GRANTABLE_RESOURCES : KEY_GRANTABLE_RESOURCES;

  for (const scope of scopes) {
    if (scope === '*') continue;

    if (scope.endsWith(':*')) {
      if (resources.has(scope.slice(0, -2))) continue;
      throw new BadRequestError(`Scope '${scope}' cannot be granted to a ${kind} API key`, {
        code: 'invalid_scope',
        param: 'scopes',
      });
    }

    if (grantable.includes(scope)) continue;
    throw new BadRequestError(`Scope '${scope}' cannot be granted to a ${kind} API key`, {
      code: 'invalid_scope',
      param: 'scopes',
    });
  }
}
