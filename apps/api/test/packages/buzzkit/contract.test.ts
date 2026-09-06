import { computeIdentityHash } from '@buzzkit/api/libs/identity';
import { Buzzkit, ConfigurationError, signIdentity } from 'buzzkit';
import { BuzzkitClient } from 'buzzkit/client';
import { describe, expect, it } from 'vitest';
import type { ContractParity } from './parity';

const TENANT_RESOURCES = [
  'messages',
  'subscribers',
  'subscriptions',
  'topics',
  'topicCategories',
  'segments',
  'workflows',
  'runs',
  'events',
  'deliveries',
  'credentials',
  'secrets',
  'sources',
  'imports',
  'liveActivities',
  'stats',
] as const;

describe('buzzkit client', () => {
  const client = new Buzzkit({ apiKey: 'bk_ws_test', baseUrl: 'https://api.example.com' });

  it('exposes every tenant resource on the root client and on a tenant scope', () => {
    const scoped = client.tenant('acme');

    for (const resource of TENANT_RESOURCES) {
      expect(client[resource], resource).toBeTypeOf('object');
      expect(scoped[resource], resource).toBeTypeOf('object');
    }
  });

  it('exposes the workspace-scoped resources behind a slug', () => {
    const workspace = client.workspace('acme');

    expect(workspace.webhooks).toBeTypeOf('object');
    expect(workspace.members).toBeTypeOf('object');
    expect(workspace.audit).toBeTypeOf('object');
  });

  it('refuses a workspace scope when no slug is known', () => {
    expect(() => client.workspace()).toThrowError(/No workspace selected/);
  });

  it('hands out a subscriber scope without making a request', () => {
    const subscriber = client.subscriber('user_123');

    expect(subscriber.externalId).toBe('user_123');
    expect(subscriber.data).toBeNull();
    expect(subscriber.send).toBeTypeOf('function');
    expect(subscriber.track).toBeTypeOf('function');
  });

  it('matches every API response shape it types', () => {
    const parity: ContractParity[number] = true;
    expect(parity).toBe(true);
  });
});

describe('buzzkit key kinds', () => {
  it('refuses a client key on the server client', () => {
    expect(() => new Buzzkit({ apiKey: 'bk_pk_public' })).toThrowError(ConfigurationError);
  });

  it('refuses a workspace or tenant key in the browser client', () => {
    expect(() => new BuzzkitClient({ publishableKey: 'bk_ws_secret' })).toThrowError(ConfigurationError);
    expect(() => new BuzzkitClient({ publishableKey: 'bk_tn_secret' })).toThrowError(ConfigurationError);
  });

  it('accepts a client key in the browser client', () => {
    expect(new BuzzkitClient({ publishableKey: 'bk_pk_public' })).toBeInstanceOf(BuzzkitClient);
  });
});

describe('buzzkit identity', () => {
  it('signs an identity hash the API accepts', async () => {
    const signed = await signIdentity('user_123', 'tenant-identity-secret');
    const expected = await computeIdentityHash('user_123', 'tenant-identity-secret');

    expect(signed).toBe(expected);
  });
});
