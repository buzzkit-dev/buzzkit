import { describe, expect, it } from 'vitest';
import {
  ACTOR_TYPES,
  ALIAS_SOURCES,
  CHANNELS,
  CREDENTIAL_STATUSES,
  DELIVERY_ATTEMPT_OUTCOMES,
  DELIVERY_STATUSES,
  ENVIRONMENTS,
  EVENT_FILTER_SOURCES,
  EVENT_SOURCES,
  EVENT_VOLUME_RANGES,
  KEY_KINDS,
  LIVE_ACTIVITY_EVENTS,
  MEMBER_ROLES,
  MESSAGE_STATUSES,
  PLATFORMS,
  PROVIDERS,
  RUN_STATUSES,
  SOURCE_DELIVERY_OUTCOMES,
  STATS_INTERVALS,
  SUBSCRIPTION_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENT_SOURCES,
  WORKFLOW_STATUSES,
} from '../../src/resources/common';

const VOCABULARIES = {
  ACTOR_TYPES,
  ALIAS_SOURCES,
  CHANNELS,
  CREDENTIAL_STATUSES,
  DELIVERY_ATTEMPT_OUTCOMES,
  DELIVERY_STATUSES,
  ENVIRONMENTS,
  EVENT_FILTER_SOURCES,
  EVENT_SOURCES,
  EVENT_VOLUME_RANGES,
  KEY_KINDS,
  LIVE_ACTIVITY_EVENTS,
  MEMBER_ROLES,
  MESSAGE_STATUSES,
  PLATFORMS,
  PROVIDERS,
  RUN_STATUSES,
  SOURCE_DELIVERY_OUTCOMES,
  STATS_INTERVALS,
  SUBSCRIPTION_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENT_SOURCES,
  WORKFLOW_STATUSES,
};

const POSTGRES_BACKED = {
  ACTOR_TYPES: ['member', 'user', 'key', 'system'],
  ALIAS_SOURCES: ['system', 'manual'],
  CHANNELS: ['push', 'email'],
  CREDENTIAL_STATUSES: ['unvalidated', 'active', 'invalid'],
  DELIVERY_ATTEMPT_OUTCOMES: ['sent', 'retry', 'failed', 'invalid'],
  DELIVERY_STATUSES: ['pending', 'retrying', 'sent', 'delivered', 'bounced', 'failed', 'invalid'],
  ENVIRONMENTS: ['production', 'sandbox'],
  KEY_KINDS: ['workspace', 'tenant', 'client'],
  MEMBER_ROLES: ['member', 'admin', 'owner'],
  MESSAGE_STATUSES: ['queued', 'processing', 'completed', 'scheduled', 'canceled'],
  PLATFORMS: ['ios', 'android'],
  PROVIDERS: ['apns', 'fcm', 'resend'],
  SOURCE_DELIVERY_OUTCOMES: ['event', 'duplicate', 'dropped', 'rejected', 'unverified'],
  SUBSCRIPTION_STATUSES: ['active', 'invalid'],
  WEBHOOK_DELIVERY_STATUSES: ['pending', 'success', 'failed', 'exhausted'],
  WEBHOOK_EVENT_SOURCES: ['audit', 'stream'],
  WORKFLOW_STATUSES: ['draft', 'active', 'paused'],
};

describe('the shared vocabularies', () => {
  it('are non-empty lists of unique lowercase names', () => {
    for (const [name, values] of Object.entries(VOCABULARIES)) {
      expect(values.length, name).toBeGreaterThan(0);
      expect(new Set<string>(values).size, name).toBe(values.length);
      for (const value of values) expect(value, `${name}.${value}`).toBe(value.toLowerCase());
    }
  });

  it('pins the values Postgres enums are generated from, so a change needs a migration', () => {
    for (const [name, expected] of Object.entries(POSTGRES_BACKED)) {
      expect([...VOCABULARIES[name as keyof typeof POSTGRES_BACKED]], name).toEqual(expected);
    }
  });

  it('keeps the run statuses the engine reports', () => {
    expect([...RUN_STATUSES].sort()).toEqual(
      ['canceled', 'completed', 'failed', 'running', 'sleeping', 'waiting'].sort()
    );
  });

  it('separates the sources an event can be written with from the ones it can be filtered by', () => {
    expect([...EVENT_SOURCES].sort()).toEqual(['android', 'ios', 'server', 'system', 'web']);
    expect([...EVENT_FILTER_SOURCES].sort()).toEqual([
      'android',
      'ios',
      'server',
      'system',
      'web',
      'webhook',
    ]);
  });
});
