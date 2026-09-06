import {
  assertAnonymousSource,
  isAnonymousId,
  mergeAnonymousSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/actor', () => ({ subscriberActor: vi.fn() }));

const subscriber = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    externalId: 'anon_abc',
    attributes: {},
    identityVerifiedAt: null,
    ...overrides,
  }) as never;

describe('isAnonymousId', () => {
  it('accepts the ids the SDK mints and rejects everything else', () => {
    expect(isAnonymousId('anon_9RmZ0hVQb2xKcT4wLpN7s')).toBe(true);
    expect(isAnonymousId('anon_')).toBe(true);
    expect(isAnonymousId('user_42')).toBe(false);
    expect(isAnonymousId('onesignal:8f2')).toBe(false);
    expect(isAnonymousId('ANON_upper')).toBe(false);
    expect(isAnonymousId('prefixed_anon_abc')).toBe(false);
  });
});

describe('assertAnonymousSource', () => {
  it('allows an unverified anonymous subscriber', () => {
    expect(() => assertAnonymousSource(subscriber())).not.toThrow();
  });

  it('refuses a source that is not anonymous', () => {
    expect(() => assertAnonymousSource(subscriber({ externalId: 'user_7' }))).toThrowError(/anonymous id/);
  });

  it('refuses a source whose identity was verified', () => {
    expect(() =>
      assertAnonymousSource(subscriber({ identityVerifiedAt: new Date('2026-09-01T00:00:00Z') }))
    ).toThrowError(/verified subscriber cannot be merged by an app/);
  });
});

describe('mergeAnonymousSubscriber', () => {
  it('does nothing when the anonymous id already is the identified one', async () => {
    const db = { select: vi.fn() } as never;

    const merge = await mergeAnonymousSubscriber(db, 1, {
      anonymousId: 'user_42',
      externalId: 'user_42',
    });

    expect(merge).toBeNull();
  });
});
