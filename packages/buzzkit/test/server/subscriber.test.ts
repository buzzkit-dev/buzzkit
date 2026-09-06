import { describe, expect, it } from 'vitest';
import { BuzzKitError } from '../../src/core/errors';
import { BuzzKit } from '../../src/server/buzzkit';
import { envelope, page, type Stub, stub } from '../utils/stub';

const record = {
  id: 'sbr_1',
  externalId: 'user_123',
  attributes: { plan: 'pro' },
  verified: false,
  identityVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function client(source: Stub) {
  return new BuzzKit({ apiKey: 'bk_ws_k', baseUrl: 'https://api.test', fetch: source.fetch });
}

describe('BuzzKit.subscriber', () => {
  it('builds a handle without a request', () => {
    const source = stub([]);
    const subscriber = client(source).subscriber('user_123');

    expect(source.calls).toHaveLength(0);
    expect(subscriber.externalId).toBe('user_123');
    expect(subscriber.data).toBeNull();
  });
});

describe('BuzzKit.identify', () => {
  it('upserts and returns a handle carrying the record', async () => {
    const source = stub([envelope(record)]);

    const subscriber = await client(source).identify('user_123', { email: 'ada@acme.com' });

    expect(source.calls[0]?.method).toBe('PUT');
    expect(source.calls[0]?.url).toBe('https://api.test/v1/subscribers/user_123');
    expect(source.calls[0]?.body).toEqual({ email: 'ada@acme.com' });
    expect(subscriber.data.id).toBe('sbr_1');
    expect(subscriber.externalId).toBe('user_123');
  });

  it('upserts with no changes when given nothing', async () => {
    const source = stub([envelope(record)]);

    await client(source).identify('user_123');

    expect(source.calls[0]?.body).toEqual({});
  });

  it('encodes an external id that would change the path', async () => {
    const source = stub([envelope(record)]);

    await client(source).identify('tenant/user 1');

    expect(source.calls[0]?.url).toBe('https://api.test/v1/subscribers/tenant%2Fuser%201');
  });
});

describe('SubscriberScope', () => {
  it('binds the external id into a send', async () => {
    const source = stub([envelope({ id: 'msg_1' })]);

    await client(source).subscriber('user_123').send({ title: 'Hey', body: 'There' });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/messages');
    expect(source.calls[0]?.body).toEqual({ title: 'Hey', body: 'There', to: 'user_123' });
  });

  it('tracks one event and unwraps it', async () => {
    const tracked = { id: 'evt_1', name: 'workout.completed', status: 'accepted' };
    const source = stub([page([tracked])]);

    const event = await client(source).subscriber('user_123').track('workout.completed', { minutes: 30 });

    expect(source.calls[0]?.body).toEqual({
      events: [{ externalId: 'user_123', name: 'workout.completed', data: { minutes: 30 } }],
    });
    expect(event).toEqual(tracked);
  });

  it('tracks an event with no data', async () => {
    const source = stub([page([{ id: 'evt_1' }])]);

    await client(source).subscriber('user_123').track('app.opened');

    expect(source.calls[0]?.body).toEqual({ events: [{ externalId: 'user_123', name: 'app.opened' }] });
  });

  it('fails loudly when the API accepts no event', async () => {
    const source = stub([page([])]);

    await expect(client(source).subscriber('user_123').track('workout.completed')).rejects.toBeInstanceOf(
      BuzzKitError
    );
  });

  it('injects the external id into a subscription', async () => {
    const source = stub([envelope({ id: 'sbn_1' })]);

    await client(source).subscriber('user_123').subscribe({ token: 'abc', platform: 'ios' });

    expect(source.calls[0]?.url).toBe('https://api.test/v1/subscriptions');
    expect(source.calls[0]?.body).toEqual({ token: 'abc', platform: 'ios', externalId: 'user_123' });
  });

  it('routes every read at the subscriber path', async () => {
    const source = stub([page([]), page([]), page([]), page([]), page([]), envelope(record)]);
    const subscriber = client(source).subscriber('user_123');

    await subscriber.subscriptions();
    await subscriber.preferences();
    await subscriber.deliveries();
    await subscriber.timeline();
    await subscriber.runs();
    await subscriber.retrieve();

    expect(source.calls.map((call) => call.url)).toEqual([
      'https://api.test/v1/subscribers/user_123/subscriptions',
      'https://api.test/v1/subscribers/user_123/preferences',
      'https://api.test/v1/subscribers/user_123/deliveries',
      'https://api.test/v1/subscribers/user_123/timeline',
      'https://api.test/v1/subscribers/user_123/runs',
      'https://api.test/v1/subscribers/user_123',
    ]);
  });

  it('patches preferences', async () => {
    const source = stub([page([])]);

    await client(source).subscriber('user_123').updatePreferences({ 'product-updates': false });

    expect(source.calls[0]?.method).toBe('PATCH');
    expect(source.calls[0]?.url).toBe('https://api.test/v1/subscribers/user_123/preferences');
    expect(source.calls[0]?.body).toEqual({ preferences: { 'product-updates': false } });
  });

  it('removes the subscriber', async () => {
    const source = stub([envelope({ ...record, deleted: true })]);

    const deleted = await client(source).subscriber('user_123').remove();

    expect(source.calls[0]?.method).toBe('DELETE');
    expect(deleted.deleted).toBe(true);
  });

  it('re-identifies into a handle that carries the fresh record', async () => {
    const source = stub([envelope({ ...record, attributes: { plan: 'enterprise' } })]);

    const subscriber = await client(source)
      .subscriber('user_123')
      .identify({ attributes: { plan: 'enterprise' } });

    expect(subscriber.data.attributes).toEqual({ plan: 'enterprise' });
  });

  it('keeps the tenant scope of the client it came from', async () => {
    const source = stub([envelope({ id: 'msg_1' })]);

    await client(source).tenant('acme').subscriber('user_123').send({ title: 'Hey' });

    expect(source.calls[0]?.headers['buzzkit-tenant']).toBe('acme');
  });
});
