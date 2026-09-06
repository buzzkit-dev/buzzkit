import { describe, expect, it } from 'vitest';
import { BuzzKitClient } from '../../src/client/buzzkit';
import { ConfigurationError } from '../../src/core/errors';
import { envelope, page, type Stub, stub } from '../utils/stub';

const identity = { externalId: 'user_123', identityHash: 'deadbeef' };

const preference = {
  id: 'tpc_1',
  slug: 'product-updates',
  name: 'Product updates',
  description: null,
  category: null,
  channels: { push: { optedIn: true, isDefault: false } },
};

function client(source: Stub, overrides: { identity?: typeof identity } = {}) {
  return new BuzzKitClient({
    publishableKey: 'bk_pk_public',
    baseUrl: 'https://api.test',
    fetch: source.fetch,
    identity,
    ...overrides,
  });
}

function anonymous(source: Stub) {
  return new BuzzKitClient({
    publishableKey: 'bk_pk_public',
    baseUrl: 'https://api.test',
    fetch: source.fetch,
  });
}

describe('BuzzKitClient construction', () => {
  it('requires a publishable key', () => {
    expect(() => new BuzzKitClient({ publishableKey: '' })).toThrow(ConfigurationError);
  });

  it('refuses a secret key', () => {
    for (const key of ['bk_ws_secret', 'bk_tn_secret']) {
      expect(() => new BuzzKitClient({ publishableKey: key }), key).toThrow(ConfigurationError);
    }
  });

  it('exposes the identity it was built with', () => {
    expect(client(stub([])).identity).toEqual(identity);
    expect(anonymous(stub([])).identity).toBeNull();
  });
});

describe('BuzzKitClient.as', () => {
  it('returns a client for another subscriber, leaving the original alone', async () => {
    const source = stub([page([preference]), page([preference])]);
    const base = client(source);

    const other = base.as({ externalId: 'user_999' });
    await other.preferences();
    await base.preferences();

    expect(other.identity?.externalId).toBe('user_999');
    expect(source.calls[0]?.headers['buzzkit-subscriber']).toBe('user_999');
    expect(source.calls[1]?.headers['buzzkit-subscriber']).toBe('user_123');
  });

  it('identifies a client that had none', async () => {
    const source = stub([page([preference])]);

    await anonymous(source).as({ externalId: 'user_5' }).preferences();

    expect(source.calls[0]?.headers['buzzkit-subscriber']).toBe('user_5');
  });
});

describe('BuzzKitClient auth headers', () => {
  it('sends the publishable key and the identity headers', async () => {
    const source = stub([page([preference])]);

    await client(source).preferences();

    expect(source.calls[0]?.headers).toMatchObject({
      authorization: 'Bearer bk_pk_public',
      'buzzkit-subscriber': 'user_123',
      'buzzkit-identity': 'deadbeef',
    });
  });

  it('omits the identity hash when the tenant does not require verification', async () => {
    const source = stub([page([preference])]);

    await anonymous(source).as({ externalId: 'user_5' }).preferences();

    expect(source.calls[0]?.headers['buzzkit-identity']).toBeUndefined();
  });
});

describe('BuzzKitClient without an identity', () => {
  it('refuses every call rather than reaching the API', async () => {
    const source = stub([]);
    const target = anonymous(source);

    await expect(target.preferences()).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.updatePreferences({})).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.identify()).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.track('a')).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.subscribeEmail({ address: 'a@b.c' })).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.updateSubscription('sbn_1', true)).rejects.toBeInstanceOf(ConfigurationError);
    await expect(target.removeSubscription('sbn_1')).rejects.toBeInstanceOf(ConfigurationError);
    expect(source.calls).toHaveLength(0);
  });
});

describe('BuzzKitClient.identify', () => {
  it('posts to the client route with the identity in the body', async () => {
    const source = stub([envelope({ id: 'sbr_1', externalId: 'user_123' })]);

    await client(source).identify({ email: 'ada@acme.com', attributes: { plan: 'pro' } });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/client/identify');
    expect(source.calls[0]?.body).toEqual({
      email: 'ada@acme.com',
      attributes: { plan: 'pro' },
      externalId: 'user_123',
      identityHash: 'deadbeef',
    });
  });

  it('carries an anonymous id for the merge', async () => {
    const source = stub([envelope({ id: 'sbr_1' })]);

    await client(source).identify({ anonymousId: 'anon_1' });

    expect(source.calls[0]?.body).toMatchObject({ anonymousId: 'anon_1' });
  });
});

describe('BuzzKitClient.preferences', () => {
  it('unwraps the list', async () => {
    const source = stub([page([preference])]);

    await expect(client(source).preferences()).resolves.toEqual([preference]);
    expect(source.calls[0]?.method).toBe('GET');
  });

  it('patches and returns the new list', async () => {
    const updated = { ...preference, channels: { push: { optedIn: false, isDefault: false } } };
    const source = stub([page([updated])]);

    await expect(client(source).updatePreferences({ 'product-updates': { push: false } })).resolves.toEqual([
      updated,
    ]);
    expect(source.calls[0]?.method).toBe('PATCH');
    expect(source.calls[0]?.body).toEqual({ preferences: { 'product-updates': { push: false } } });
  });
});

describe('BuzzKitClient.track', () => {
  it('sends a web-sourced event and unwraps it', async () => {
    const tracked = { id: 'evt_1', name: 'pricing.viewed', status: 'accepted' };
    const source = stub([page([tracked])]);

    await expect(client(source).track('pricing.viewed', { plan: 'pro' })).resolves.toEqual(tracked);
    expect(source.calls[0]?.url).toBe('https://api.test/v1/client/events');
    expect(source.calls[0]?.body).toEqual({
      externalId: 'user_123',
      identityHash: 'deadbeef',
      source: 'web',
      events: [{ name: 'pricing.viewed', data: { plan: 'pro' } }],
    });
  });

  it('fails loudly when the API accepts no event', async () => {
    const source = stub([page([])]);

    await expect(client(source).track('pricing.viewed')).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe('BuzzKitClient subscriptions', () => {
  it('registers an email address', async () => {
    const source = stub([envelope({ id: 'sbn_1', channel: 'email' })]);

    await client(source).subscribeEmail({ address: 'ada@acme.com' });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/client/subscriptions');
    expect(source.calls[0]?.body).toEqual({
      externalId: 'user_123',
      identityHash: 'deadbeef',
      channel: 'email',
      address: 'ada@acme.com',
    });
  });

  it('mutes and removes one by id', async () => {
    const source = stub([
      envelope({ id: 'sbn_1', enabled: false }),
      envelope({ id: 'sbn_1', deleted: true }),
    ]);
    const target = client(source);

    await target.updateSubscription('sbn_1', false);
    await target.removeSubscription('sbn_1');

    expect(source.calls[0]?.method).toBe('PATCH');
    expect(source.calls[0]?.body).toEqual({ enabled: false });
    expect(source.calls[1]?.method).toBe('DELETE');
    expect(source.calls[1]?.url).toBe('https://api.test/v1/client/subscriptions/sbn_1');
  });
});
