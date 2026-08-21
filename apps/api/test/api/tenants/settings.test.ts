import {
  assertValidTenantSettings,
  mergeTenantSettings,
  resolveTenantSettings,
} from '@buzzkit/api/api/tenants/index';
import { describe, expect, it } from 'vitest';

describe('tenant settings catalog', () => {
  it('accepts only known groups, keys, and types', () => {
    expect(() => assertValidTenantSettings({ identity: { requireVerification: true } })).not.toThrow();
    expect(() => assertValidTenantSettings({ channels: { push: { enabled: false } } })).not.toThrow();
    for (const bad of [
      [],
      null,
      { identity: true },
      { identity: { foo: 1 } },
      { identity: { requireVerification: 'yes' } },
      { channels: [] },
      { channels: { push: true } },
      { channels: { fax: { enabled: true } } },
      { other: {} },
    ]) {
      expect(() => assertValidTenantSettings(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it('merges deeply and resolves against defaults idempotently', () => {
    const merged = mergeTenantSettings(
      { channels: { push: { enabled: false } } },
      { identity: { requireVerification: true } }
    );
    expect(merged).toEqual({
      channels: { push: { enabled: false } },
      identity: { requireVerification: true },
    });
    const resolved = resolveTenantSettings(merged);
    expect(resolved.identity.requireVerification).toBe(true);
    expect(resolved.channels.push.enabled).toBe(false);
    expect(resolved.channels.email.enabled).toBe(true);
    expect(resolveTenantSettings(resolved)).toEqual(resolved);
    expect(resolveTenantSettings({})).toEqual(resolveTenantSettings(undefined));
  });
});
