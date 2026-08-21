import {
  assertValidKeyScopes,
  hasScope,
  KEY_GRANTABLE_SCOPES,
  ROLE_SCOPES,
  SCOPE_CATALOG,
  SESSION_ONLY_SCOPES,
  TENANT_KEY_GRANTABLE_SCOPES,
} from '@buzzkit/api/libs/scopes';
import { describe, expect, it } from 'vitest';

describe('scope catalog', () => {
  it('pins the session-only set — a key can never escalate through these', () => {
    expect([...SESSION_ONLY_SCOPES].sort()).toEqual(
      [
        'invites:read',
        'invites:write',
        'keys:read',
        'keys:write',
        'members:write',
        'tenants:secrets',
        'workspace:delete',
      ].sort()
    );
    for (const scope of SESSION_ONLY_SCOPES) {
      expect(KEY_GRANTABLE_SCOPES).not.toContain(scope);
      expect(() => assertValidKeyScopes([scope], 'workspace')).toThrow();
    }
  });

  it('role bundles nest: member ⊂ admin ⊂ owner, and only owners can delete the workspace', () => {
    for (const scope of ROLE_SCOPES.member) expect(ROLE_SCOPES.admin).toContain(scope);
    for (const scope of ROLE_SCOPES.admin) expect(ROLE_SCOPES.owner).toContain(scope);
    expect(ROLE_SCOPES.owner).toContain('workspace:delete');
    expect(ROLE_SCOPES.admin).not.toContain('workspace:delete');
    expect(ROLE_SCOPES.member).not.toContain('keys:write');
    expect(ROLE_SCOPES.member).toContain('messages:send');
  });

  it('tenant keys only ever receive tenant-context scopes', () => {
    for (const scope of TENANT_KEY_GRANTABLE_SCOPES) expect(SCOPE_CATALOG[scope].context).toBe('tenant');
    expect(() => assertValidKeyScopes(['workspace:read'], 'tenant')).toThrow();
    expect(() => assertValidKeyScopes(['tenants:read'], 'tenant')).toThrow();
    expect(() => assertValidKeyScopes(['messages:*', 'subscribers:read'], 'tenant')).not.toThrow();
  });

  it('wildcards resolve per resource and never across resources', () => {
    expect(hasScope(['*'], 'keys:write')).toBe(true);
    expect(hasScope(['messages:*'], 'messages:send')).toBe(true);
    expect(hasScope(['messages:*'], 'subscribers:read')).toBe(false);
    expect(hasScope(['tenants:read'], 'workspace:read')).toBe(false);
    expect(() => assertValidKeyScopes(['bogus:*'], 'workspace')).toThrow();
  });
});
