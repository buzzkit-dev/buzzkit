import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../src/core/errors';
import { BuzzKit } from '../../src/server/buzzkit';
import { TenantScope, WorkspaceScope } from '../../src/server/scopes';
import { envelope, page, type Stub, stub } from '../utils/stub';

function client(source: Stub, overrides: { workspace?: string; tenant?: string } = {}) {
  return new BuzzKit({ apiKey: 'bk_ws_k', baseUrl: 'https://api.test', fetch: source.fetch, ...overrides });
}

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

describe('BuzzKit', () => {
  it('exposes every tenant resource, and the two workspace collections', () => {
    const buzzkit = client(stub([]));

    for (const resource of TENANT_RESOURCES) {
      expect(buzzkit[resource], resource).toBeTypeOf('object');
    }
    expect(buzzkit.tenants).toBeTypeOf('object');
    expect(buzzkit.workspaces).toBeTypeOf('object');
  });

  it('reads health without a tenant', async () => {
    const source = stub([envelope({ status: 'ok', database: { status: 'ok', latencyMs: 3 } })]);

    await expect(client(source).health()).resolves.toEqual({
      status: 'ok',
      database: { status: 'ok', latencyMs: 3 },
    });
    expect(source.calls[0]?.url).toBe('https://api.test/v1/health');
  });
});

describe('BuzzKit.tenant', () => {
  it('scopes a copy without touching the root client', async () => {
    const source = stub([envelope({}), envelope({})]);
    const buzzkit = client(source);

    const scoped = buzzkit.tenant('acme');
    await scoped.topics.list();
    await buzzkit.topics.list();

    expect(scoped).toBeInstanceOf(TenantScope);
    expect(source.calls[0]?.headers['buzzkit-tenant']).toBe('acme');
    expect(source.calls[1]?.headers['buzzkit-tenant']).toBeUndefined();
  });

  it('carries every resource onto the scope', () => {
    const scoped = client(stub([])).tenant('acme');

    for (const resource of TENANT_RESOURCES) {
      expect(scoped[resource], resource).toBeTypeOf('object');
    }
  });
});

describe('BuzzKit.workspace', () => {
  it('puts the slug in the path', async () => {
    const source = stub([page([])]);

    await client(source).workspace('acme').webhooks.list();

    expect(source.calls[0]?.url).toBe('https://api.test/v1/workspaces/acme/webhooks');
  });

  it('falls back to the configured workspace', async () => {
    const source = stub([page([])]);

    await client(source, { workspace: 'studio' }).workspace().members.list();

    expect(source.calls[0]?.url).toBe('https://api.test/v1/workspaces/studio/members');
  });

  it('refuses when no slug is known', () => {
    const buzzkit = client(stub([]));

    expect(() => buzzkit.workspace()).toThrow(ConfigurationError);
    expect(() => buzzkit.workspace()).toThrow(/No workspace selected/);
  });

  it('prefers an explicit slug over the configured one', async () => {
    const source = stub([page([])]);

    const scope = client(source, { workspace: 'studio' }).workspace('acme');
    await scope.audit.list();

    expect(scope).toBeInstanceOf(WorkspaceScope);
    expect(source.calls[0]?.url).toContain('/v1/workspaces/acme/audit');
  });

  it('encodes a slug that would otherwise change the path', async () => {
    const source = stub([page([])]);

    await client(source).workspace('a/b').webhooks.list();

    expect(source.calls[0]?.url).toBe('https://api.test/v1/workspaces/a%2Fb/webhooks');
  });
});

describe('BuzzKit.send', () => {
  it('posts the payload and generates an idempotency key', async () => {
    const source = stub([envelope({ id: 'msg_1' })]);

    await client(source).send({ to: 'user_1', title: 'Hey', body: 'There' });

    const [call] = source.calls;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe('https://api.test/v1/messages');
    expect(call?.body).toEqual({ to: 'user_1', title: 'Hey', body: 'There' });
    expect(call?.headers['idempotency-key']).toEqual(expect.any(String));
  });

  it('uses the caller-supplied key and keeps it out of the body', async () => {
    const source = stub([envelope({ id: 'msg_1' })]);

    await client(source).send({ to: 'user_1', title: 'Hey', idempotencyKey: 'order_42' });

    expect(source.calls[0]?.headers['idempotency-key']).toBe('order_42');
    expect(source.calls[0]?.body).toEqual({ to: 'user_1', title: 'Hey' });
  });
});

describe('BuzzKit.track', () => {
  it('wraps a single event into a batch', async () => {
    const source = stub([page([{ id: 'evt_1' }])]);

    await client(source).track({ externalId: 'user_1', name: 'workout.completed' });

    expect(source.calls[0]?.body).toEqual({
      events: [{ externalId: 'user_1', name: 'workout.completed' }],
    });
  });

  it('sends a batch as given', async () => {
    const source = stub([page([{ id: 'evt_1' }, { id: 'evt_2' }])]);

    await client(source).track([
      { externalId: 'user_1', name: 'a' },
      { externalId: 'user_2', name: 'b' },
    ]);

    expect(source.calls[0]?.body).toEqual({
      events: [
        { externalId: 'user_1', name: 'a' },
        { externalId: 'user_2', name: 'b' },
      ],
    });
  });
});
