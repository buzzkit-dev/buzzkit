import { AUDIT_CATALOG, isPublicEvent, PUBLIC_EVENTS } from '@buzzkit/api/api/audit/catalog';
import { describe, expect, it } from 'vitest';

describe('audit catalog', () => {
  it('keeps internal events off the webhook surface', () => {
    for (const name of ['key.created', 'key.revoked', 'invite.resent', 'profile.updated']) {
      expect(PUBLIC_EVENTS, name).not.toContain(name);
    }
    for (const name of [
      'message.created',
      'message.completed',
      'tenant.updated',
      'tenant.identity_secret_rotated',
    ]) {
      expect(PUBLIC_EVENTS, name).toContain(name);
    }
    expect(isPublicEvent('not.an.event')).toBe(false);
    expect(Object.keys(AUDIT_CATALOG).every((name) => /^[a-z_]+\.[a-z_]+$/.test(name))).toBe(true);
  });
});
