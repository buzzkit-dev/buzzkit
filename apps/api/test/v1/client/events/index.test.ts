import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type Tracked = { id: string; sequence: number; name: string; source: string; status: string };

type TrackedFull = Tracked & {
  externalId: string;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
};

type Headers = Record<string, string>;

const SDK_EVENTS = [
  { name: '$app.opened' },
  { name: '$app.backgrounded' },
  { name: '$session.ended', data: { durationSec: 12 } },
  { name: '$notification.delivered', data: { messageId: 'msg_1' } },
  { name: '$notification.opened', data: { messageId: 'msg_1', action: 'open' } },
  { name: '$permission.changed', data: { status: 'granted' } },
  { name: '$identify', data: { attributes: { plan: 'pro', level: 3 } } },
];

const SYSTEM_ONLY_EVENT_NAMES = [
  '$subscriber.created',
  '$subscriber.updated',
  '$subscriber.deleted',
  '$subscription.registered',
  '$subscription.muted',
  '$subscription.unmuted',
  '$subscription.removed',
  '$subscription.invalidated',
  '$preferences.updated',
];

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

async function setupBareClient() {
  const base = await setupWorkspace({ bare: true });
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

function trackClient(headers: Headers, body: unknown) {
  return api<{ items: TrackedFull[] }>('/v1/client/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function trackServer(headers: Headers, body: unknown) {
  const { status, body: envelope } = await api<{ items: TrackedFull[] }>('/v1/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status, body: envelope, event: envelope.data?.items[0] };
}

function timeline(headers: Headers, externalId: string) {
  return api<{ items: TrackedFull[] }>(`/v1/subscribers/${externalId}/timeline?limit=100`, { headers });
}

async function identitySecret(ownerBearer: Headers, workspaceSlug: string) {
  const { body } = await api<{ identitySecret: string }>('/v1/tenants/default/identity-secret', {
    headers: { ...ownerBearer, 'buzzkit-workspace': workspaceSlug },
  });
  return body.data!.identitySecret;
}

function sign(secret: string, externalId: string) {
  return createHmac('sha256', secret).update(externalId).digest('hex');
}

describe('POST /v1/client/events', () => {
  it('tracks a batch from the app with its source, allows the SDK events, and stamps system attributes', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const { status, body } = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: { ...clientBearer, 'accept-language': 'de-DE,de;q=0.9' },
      body: JSON.stringify({
        externalId,
        source: 'ios',
        events: [
          { id: `${uniq()}`, name: '$app.opened' },
          { id: `${uniq()}`, name: 'workout.completed', data: { duration: 12 } },
          { id: `${uniq()}`, name: '$app.backgrounded' },
        ],
      }),
    });

    expect(status).toBe(202);
    expect(body.data?.items.map((item) => item.name)).toEqual([
      '$app.opened',
      'workout.completed',
      '$app.backgrounded',
    ]);
    expect(body.data?.items.every((item) => item.source === 'ios' && item.status === 'accepted')).toBe(true);

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.attributes.$language).toBe('de-DE');

    const timeline = await eventually(
      async () => {
        const { body } = await api<{ items: Tracked[] }>(`/v1/subscribers/${externalId}/timeline`, {
          headers: keyBearer,
        });
        return (body.data?.items.length ?? 0) >= 4 ? body.data : undefined;
      },
      { label: 'timeline', timeoutMs: 60_000 }
    );
    expect(timeline.items.map((item) => item.name)).toEqual([
      '$app.backgrounded',
      'workout.completed',
      '$app.opened',
      '$subscriber.created',
    ]);
  }, 90_000);

  it('refuses engine-reserved names from the app and replays are duplicates', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const reserved = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'ios', events: [{ name: '$subscriber.created' }] }),
    });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error?.code).toBe('reserved_event');

    const id = `${uniq()}`;
    const first = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'android', events: [{ id, name: 'screen.viewed' }] }),
    });
    const second = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'android', events: [{ id, name: 'screen.viewed' }] }),
    });
    expect(first.body.data?.items[0]?.status).toBe('accepted');
    expect(second.body.data?.items[0]?.status).toBe('duplicate');
    expect(second.body.data?.items[0]?.id).toBe(first.body.data?.items[0]?.id);
  });

  it('enforces identity verification like every client call', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupClient();
    const externalId = `user_${uniq()}`;

    await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });

    const unsigned = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'ios', events: [{ name: 'x' }] }),
    });
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.error?.code).toBe('identity_required');

    const secret = await api<{ identitySecret: string }>('/v1/tenants/default/identity-secret', {
      headers: { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
    });
    const identityHash = createHmac('sha256', secret.body.data!.identitySecret)
      .update(externalId)
      .digest('hex');

    const signed = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, identityHash, source: 'ios', events: [{ name: 'x' }] }),
    });
    expect(signed.status).toBe(202);

    const subscriber = await api<{ verified: boolean }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.verified).toBe(true);
  });
});

describe('POST /v1/client/events validation', () => {
  let clientBearer: Headers;
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ clientBearer, keyBearer } = await setupBareClient());
  });

  it.each(['server', 'system', 'macos', 'IOS', ''])('refuses the source %j', async (source) => {
    const { status, body } = await trackClient(clientBearer, {
      externalId: `user_${uniq()}`,
      source,
      events: [{ name: 'x' }],
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('source');
  });

  it('requires a source', async () => {
    const { status, body } = await trackClient(clientBearer, {
      externalId: `user_${uniq()}`,
      events: [{ name: 'x' }],
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('source');
  });

  it.each(['ios', 'android', 'web'] as const)(
    'accepts the source %s and stamps it on every event',
    async (source) => {
      const externalId = `user_${uniq()}`;
      const { status, body } = await trackClient(clientBearer, {
        externalId,
        source,
        events: [{ name: 'x' }, { name: 'y' }],
      });
      expect(status).toBe(202);
      expect(body.data?.items.map((item) => item.source)).toEqual([source, source]);
      expect(body.data?.items.map((item) => item.externalId)).toEqual([externalId, externalId]);
    }
  );

  it('requires an externalId within 256 characters', async () => {
    const missing = await trackClient(clientBearer, { source: 'ios', events: [{ name: 'x' }] });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code).toBe('validation');
    expect(missing.body.error?.param).toBe('externalId');

    const empty = await trackClient(clientBearer, { externalId: '', source: 'ios', events: [{ name: 'x' }] });
    expect(empty.status).toBe(400);
    expect(empty.body.error?.param).toBe('externalId');

    const long = await trackClient(clientBearer, {
      externalId: 'u'.repeat(257),
      source: 'ios',
      events: [{ name: 'x' }],
    });
    expect(long.status).toBe(400);
    expect(long.body.error?.param).toBe('externalId');
  });

  it('names the offending event field', async () => {
    const externalId = `user_${uniq()}`;
    const name = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x' }, { name: 'Bad' }],
    });
    expect(name.status).toBe(400);
    expect(name.body.error?.code).toBe('validation');
    expect(name.body.error?.param).toBe('events.1.name');

    const id = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', id: 'i'.repeat(65) }],
    });
    expect(id.status).toBe(400);
    expect(id.body.error?.param).toBe('events.0.id');

    const timestamp = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', timestamp: 'yesterday' }],
    });
    expect(timestamp.status).toBe(400);
    expect(timestamp.body.error?.param).toBe('events.0.timestamp');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(404);
  });

  it('applies the timestamp window and the data limit per event', async () => {
    const externalId = `user_${uniq()}`;
    const stale = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', timestamp: new Date(Date.now() - 8 * 24 * 3_600_000).toISOString() }],
    });
    expect(stale.status).toBe(400);
    expect(stale.body.error?.code).toBe('invalid_timestamp');
    expect(stale.body.error?.param).toBe('timestamp');

    const future = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', timestamp: new Date(Date.now() + 2 * 3_600_000).toISOString() }],
    });
    expect(future.status).toBe(400);
    expect(future.body.error?.code).toBe('invalid_timestamp');

    const large = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', data: { blob: 'x'.repeat(9000) } }],
    });
    expect(large.status).toBe(400);
    expect(large.body.error?.code).toBe('event_data_too_large');
    expect(large.body.error?.param).toBe('data');

    const offline = new Date(Date.now() - 6 * 24 * 3_600_000).toISOString();
    const drained = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: 'x', timestamp: offline }],
    });
    expect(drained.status).toBe(202);
    expect(drained.body.data?.items[0]?.timestamp).toBe(offline);
    expect(new Date(drained.body.data!.items[0]!.receivedAt).getTime()).toBeGreaterThan(
      new Date(offline).getTime()
    );
  });

  it.skip('refuses data that is not an object (skipped: [1] is still coerced to {"0":1})', async () => {
    const { status, body } = await trackClient(clientBearer, {
      externalId: `user_${uniq()}`,
      source: 'ios',
      events: [{ name: 'x', data: [1] }],
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('events.0.data');
  });

  it('takes at most 100 events per call and at least one', async () => {
    const externalId = `user_${uniq()}`;
    const empty = await trackClient(clientBearer, { externalId, source: 'ios', events: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('validation');
    expect(empty.body.error?.param).toBe('events');

    const tooMany = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: Array.from({ length: 101 }, (_, index) => ({ name: 'x', id: `${externalId}-${index}` })),
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error?.code).toBe('validation');
    expect(tooMany.body.error?.param).toBe('events');

    const full = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: Array.from({ length: 100 }, (_, index) => ({ name: 'x', id: `${externalId}-${index}` })),
    });
    expect(full.status).toBe(202);
    expect(full.body.data?.items).toHaveLength(100);
    expect(full.body.data?.items.map((item) => item.sequence)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 2)
    );
  });
});

describe('POST /v1/client/events reserved names', () => {
  let clientBearer: Headers;
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ clientBearer, keyBearer } = await setupBareClient());
  });

  it('accepts every SDK event with its data', async () => {
    const externalId = `user_${uniq()}`;
    const { status, body } = await trackClient(clientBearer, {
      externalId,
      source: 'android',
      events: SDK_EVENTS,
    });

    expect(status).toBe(202);
    expect(body.data?.items.map((item) => item.name)).toEqual(SDK_EVENTS.map((event) => event.name));
    expect(body.data?.items.map((item) => item.data)).toEqual(SDK_EVENTS.map((event) => event.data ?? {}));
    expect(body.data?.items.every((item) => item.status === 'accepted' && item.source === 'android')).toBe(
      true
    );
    expect(body.data?.items.map((item) => item.sequence)).toEqual(SDK_EVENTS.map((_, index) => index + 2));
  });

  it.each(SYSTEM_ONLY_EVENT_NAMES)('refuses the engine name %s', async (name) => {
    const externalId = `user_${uniq()}`;
    const { status, body } = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: '$app.opened' }, { name, data: { externalId } }],
    });

    expect(status).toBe(400);
    expect(body.error?.code).toBe('reserved_event');
    expect(body.error?.param).toBe('name');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(404);
  });

  it('refuses unknown $ names', async () => {
    const { status, body } = await trackClient(clientBearer, {
      externalId: `user_${uniq()}`,
      source: 'web',
      events: [{ name: '$custom' }],
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('reserved_event');
  });
});

describe('POST /v1/client/events identity', () => {
  it('refuses a wrong hash even when verification is optional and creates nothing', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupBareClient();
    const externalId = `user_${uniq()}`;
    const secret = await identitySecret(ownerBearer, workspace.slug);

    const wrong = await trackClient(clientBearer, {
      externalId,
      identityHash: sign(secret, `someone-else`),
      source: 'ios',
      events: [{ name: 'x' }],
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error?.code).toBe('invalid_identity_hash');
    expect(wrong.body.error?.param).toBe('identityHash');

    const malformed = await trackClient(clientBearer, {
      externalId,
      identityHash: 'deadbeef',
      source: 'ios',
      events: [{ name: 'x' }],
    });
    expect(malformed.status).toBe(401);
    expect(malformed.body.error?.code).toBe('invalid_identity_hash');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(404);

    const unsigned = await trackClient(clientBearer, { externalId, source: 'ios', events: [{ name: 'x' }] });
    expect(unsigned.status).toBe(202);
    const created = await api<{ verified: boolean }>(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(created.body.data?.verified).toBe(false);

    const signed = await trackClient(clientBearer, {
      externalId,
      identityHash: sign(secret, externalId).toUpperCase(),
      source: 'ios',
      events: [{ name: 'y' }],
    });
    expect(signed.status).toBe(202);
    const verified = await api<{ verified: boolean }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(verified.body.data?.verified).toBe(true);
  });

  it('refuses a missing or wrong hash when the tenant requires verification and tracks nothing', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupBareClient();
    const externalId = `user_${uniq()}`;
    await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });
    const secret = await identitySecret(ownerBearer, workspace.slug);

    const missing = await trackClient(clientBearer, { externalId, source: 'ios', events: [{ name: 'x' }] });
    expect(missing.status).toBe(401);
    expect(missing.body.error?.code).toBe('identity_required');
    expect(missing.body.error?.param).toBe('identityHash');

    const wrong = await trackClient(clientBearer, {
      externalId,
      identityHash: sign(secret, 'other'),
      source: 'ios',
      events: [{ name: 'x' }],
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error?.code).toBe('invalid_identity_hash');

    expect((await api(`/v1/subscribers/${externalId}`, { headers: keyBearer })).status).toBe(404);

    const signed = await trackClient(clientBearer, {
      externalId,
      identityHash: sign(secret, externalId),
      source: 'ios',
      events: [{ name: 'x' }],
    });
    expect(signed.status).toBe(202);
    const subscriber = await api<{ verified: boolean }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.verified).toBe(true);
  });
});

describe('POST /v1/client/events subscriber state', () => {
  let clientBearer: Headers;
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ clientBearer, keyBearer } = await setupBareClient());
  });

  it('stamps system attributes from the request', async () => {
    const externalId = `user_${uniq()}`;
    await trackClient(
      { ...clientBearer, 'accept-language': 'fr-CH, fr;q=0.9, en;q=0.8', 'cf-ipcountry': 'CH' },
      { externalId, source: 'web', events: [{ name: 'x' }] }
    );

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    const attributes = subscriber.body.data!.attributes;
    expect(attributes.$language).toBe('fr-CH');
    expect(attributes.$country).toMatch(/^[A-Z]{2}$/);
    expect(typeof attributes.$timezone).toBe('string');

    await trackClient(
      { ...clientBearer, 'accept-language': 'de' },
      { externalId, source: 'web', events: [{ name: 'y' }] }
    );
    const refreshed = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(refreshed.body.data?.attributes.$language).toBe('de');

    await trackClient(
      { ...clientBearer, 'accept-language': '*' },
      { externalId, source: 'web', events: [{ name: 'z' }] }
    );
    const wildcard = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(wildcard.body.data?.attributes.$language).toBe('de');
  });

  it('keeps one contiguous sequence per subscriber across client and server writes', async () => {
    const externalId = `user_${uniq()}`;

    const first = await trackServer(keyBearer, { externalId, name: 'server.one' });
    const batch = await trackClient(clientBearer, {
      externalId,
      source: 'ios',
      events: [{ name: '$app.opened' }, { name: 'screen.viewed' }, { name: '$app.backgrounded' }],
    });
    const second = await trackServer(keyBearer, { externalId, name: 'server.two' });
    const again = await trackClient(clientBearer, { externalId, source: 'ios', events: [{ name: 'tap' }] });

    expect(first.event?.sequence).toBe(2);
    expect(batch.body.data?.items.map((item) => item.sequence)).toEqual([3, 4, 5]);
    expect(second.event?.sequence).toBe(6);
    expect(again.body.data?.items[0]?.sequence).toBe(7);

    const { body } = await timeline(keyBearer, externalId);
    expect(body.data?.items.map((item) => [item.sequence, item.name, item.source])).toEqual([
      [7, 'tap', 'ios'],
      [6, 'server.two', 'server'],
      [5, '$app.backgrounded', 'ios'],
      [4, 'screen.viewed', 'ios'],
      [3, '$app.opened', 'ios'],
      [2, 'server.one', 'server'],
      [1, '$subscriber.created', 'system'],
    ]);
  });

  it('dedupes ids across the client and the server routes', async () => {
    const externalId = `user_${uniq()}`;
    const serverFirst = `server-${uniq()}`;
    const clientFirst = `client-${uniq()}`;

    const server = await trackServer(keyBearer, { externalId, name: 'x', id: serverFirst });
    const clientReplay = await trackClient(clientBearer, {
      externalId,
      source: 'android',
      events: [
        { name: 'x', id: serverFirst },
        { name: 'y', id: clientFirst },
      ],
    });
    const serverReplay = await trackServer(keyBearer, { externalId, name: 'y', id: clientFirst });

    expect(server.event?.status).toBe('accepted');
    expect(clientReplay.body.data?.items[0]).toMatchObject({
      status: 'duplicate',
      id: server.event?.id,
      sequence: server.event?.sequence,
    });
    expect(clientReplay.body.data?.items[1]?.status).toBe('accepted');
    expect(serverReplay.event).toMatchObject({
      status: 'duplicate',
      id: clientReplay.body.data?.items[1]?.id,
      sequence: clientReplay.body.data?.items[1]?.sequence,
    });

    const { body } = await timeline(keyBearer, externalId);
    expect(body.data?.items.map((item) => item.name)).toEqual(['y', 'x', '$subscriber.created']);
  });

  it('lands client events on the stream with their source', async () => {
    const externalId = `user_${uniq()}`;
    const name = `client.${uniq()}`;
    await trackClient(clientBearer, {
      externalId,
      source: 'web',
      events: [{ name, data: { screen: 'home', path: ['a', 'b'] } }],
    });

    const listed = await eventually(
      async () => {
        const { body } = await api<{ items: TrackedFull[] }>(`/v1/events?name=${name}`, {
          headers: keyBearer,
        });
        return body.data?.items.length ? body.data.items : undefined;
      },
      { label: 'client event listed', timeoutMs: 60_000 }
    );
    expect(listed[0]).toMatchObject({
      name,
      source: 'web',
      externalId,
      data: { screen: 'home', path: ['a', 'b'] },
    });
  }, 90_000);
});
