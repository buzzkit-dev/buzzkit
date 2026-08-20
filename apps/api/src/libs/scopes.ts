import { BadRequestError, MissingPermissionError } from './error';

type ScopeDefinition = {
  context: 'user' | 'workspace';
  role: 'member' | 'admin' | 'owner' | null;
  key: boolean;
};

/**
 * The scope catalog. `context` decides how a route authenticates (user =
 * session-only account routes; workspace = session membership or API key).
 * `role` is the minimum workspace role whose bundle includes the scope; `key`
 * says whether an API key may ever hold it. Data-plane scopes (devices:*,
 * messages:*, credentials:*) arrive with their phases and add a 'tenant'
 * context resolved per tenant.
 */
export const SCOPE_CATALOG = {
  // Account (session-only, no workspace)
  'account:read': { context: 'user', role: null, key: false },
  'account:write': { context: 'user', role: null, key: false },

  // Workspace
  'workspace:read': { context: 'workspace', role: 'member', key: true },
  'workspace:write': { context: 'workspace', role: 'admin', key: true },
  'workspace:delete': { context: 'workspace', role: 'owner', key: true },

  // Members & invites
  'members:read': { context: 'workspace', role: 'member', key: true },
  'members:write': { context: 'workspace', role: 'admin', key: true },
  'invites:read': { context: 'workspace', role: 'admin', key: true },
  'invites:write': { context: 'workspace', role: 'admin', key: true },

  // Credentials — session-only: a leaked key must never mint or revoke keys.
  'keys:read': { context: 'workspace', role: 'member', key: false },
  'keys:write': { context: 'workspace', role: 'admin', key: false },

  // Tenants — the product promise: workspace keys create and manage tenants.
  'tenants:read': { context: 'workspace', role: 'member', key: true },
  'tenants:write': { context: 'workspace', role: 'admin', key: true },
} as const satisfies Record<string, ScopeDefinition>;

export type Scope = keyof typeof SCOPE_CATALOG;

export type ScopeContext = ScopeDefinition['context'];

export type AuthRole = 'owner' | 'admin' | 'member';

export const SCOPES: { [K in Scope]: (typeof SCOPE_CATALOG)[K]['context'] } = Object.fromEntries(
  (Object.keys(SCOPE_CATALOG) as Scope[]).map((scope) => [scope, SCOPE_CATALOG[scope].context])
) as { [K in Scope]: (typeof SCOPE_CATALOG)[K]['context'] };

const ALL_SCOPES = Object.keys(SCOPE_CATALOG) as Scope[];
const WORKSPACE_SCOPES = ALL_SCOPES.filter((scope) => SCOPE_CATALOG[scope].context === 'workspace');

export const SESSION_SCOPES: readonly Scope[] = ALL_SCOPES.filter(
  (scope) => SCOPE_CATALOG[scope].context === 'user'
);

const MEMBER_SCOPES = WORKSPACE_SCOPES.filter((scope) => SCOPE_CATALOG[scope].role === 'member');
const ADMIN_SCOPES = [
  ...MEMBER_SCOPES,
  ...WORKSPACE_SCOPES.filter((scope) => SCOPE_CATALOG[scope].role === 'admin'),
];
const OWNER_SCOPES = [
  ...ADMIN_SCOPES,
  ...WORKSPACE_SCOPES.filter((scope) => SCOPE_CATALOG[scope].role === 'owner'),
];

/** Default scope bundles per workspace role — derived from the catalog. */
export const ROLE_SCOPES: Record<AuthRole, readonly Scope[]> = {
  member: MEMBER_SCOPES,
  admin: ADMIN_SCOPES,
  owner: OWNER_SCOPES,
};

/** Scopes an API key can never satisfy, regardless of its grants (even '*'). */
export const SESSION_ONLY_SCOPES: ReadonlySet<Scope> = new Set(
  WORKSPACE_SCOPES.filter((scope) => !SCOPE_CATALOG[scope].key)
);

/** Scopes grantable to API keys. */
export const KEY_GRANTABLE_SCOPES: readonly Scope[] = WORKSPACE_SCOPES.filter(
  (scope) => SCOPE_CATALOG[scope].key
);

const KEY_GRANTABLE_RESOURCES: ReadonlySet<string> = new Set(
  KEY_GRANTABLE_SCOPES.map((scope) => scope.split(':')[0] as string)
);

/**
 * Granted entries may be exact scopes or wildcards: '*' grants everything,
 * '<resource>:*' grants every action on a resource.
 */
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

export function assertValidKeyScopes(scopes: readonly string[]): void {
  for (const scope of scopes) {
    if (scope === '*') continue;

    if (scope.endsWith(':*')) {
      if (KEY_GRANTABLE_RESOURCES.has(scope.slice(0, -2))) continue;
      throw new BadRequestError(`Scope '${scope}' cannot be granted to an API key`);
    }

    if ((KEY_GRANTABLE_SCOPES as readonly string[]).includes(scope)) continue;
    throw new BadRequestError(`Scope '${scope}' cannot be granted to an API key`);
  }
}
