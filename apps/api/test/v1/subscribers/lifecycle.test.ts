import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { APNS_REACHABLE, fakeToken } from '../../utils/fixtures';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';

type TimelineItem = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  externalId: string | null;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  runId: string | null;
  messageId: string | null;
  step: string | null;
};

type TimelinePage = { items: TimelineItem[]; hasMore: boolean; nextCursor: string | null };

type Headers = Record<string, string>;

function subscriberPath(externalId: string): string {
  return `/v1/subscribers/${encodeURIComponent(externalId)}`;
}

function timelinePath(externalId: string, query = ''): string {
  return `${subscriberPath(externalId)}/timeline${query}`;
}

async function timelineOf(headers: Headers, externalId: string, atLeast: number): Promise<TimelineItem[]> {
  return await eventually(
    async () => {
      const { body } = await api<TimelinePage>(timelinePath(externalId), { headers });
      const items = body.data?.items ?? [];
      return items.length >= atLeast ? items : undefined;
    },
    { label: `timeline of ${externalId} with ${atLeast} events` }
  );
}

function oldestFirst(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => a.sequence - b.sequence);
}

function customAttributes(attributes: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries((attributes ?? {}) as Record<string, unknown>).filter(([key]) => !key.startsWith('$'))
  );
}

function expectSystemEvent(item: TimelineItem | undefined, externalId: string, name: string, data: unknown) {
  expect(item, name).toBeDefined();
  expect(item?.name).toBe(name);
  expect(item?.source).toBe('system');
  expect(item?.externalId).toBe(externalId);
  expect(item?.data).toEqual(
    name.startsWith('$subscription.')
      ? { enabled: name !== '$subscription.muted', ...(data as object) }
      : data
  );
  expect(item?.id).toMatch(/^evt_[0-9a-f-]{36}$/);
  expect(item?.runId).toBeNull();
  expect(item?.messageId).toBeNull();
  expect(item?.step).toBeNull();
}

async function identify(headers: Headers, externalId: string, body: object = {}) {
  return api<{ id: string; attributes: Record<string, unknown> }>(subscriberPath(externalId), {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

async function register(headers: Headers, body: Record<string, unknown>, path = '/v1/subscriptions') {
  return api<{ id: string; channel: string; platform: string | null; endpoint: string; status: string }>(
    path,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );
}

async function createTopic(headers: Headers, channels?: string[]) {
  const slug = `topic-${uniq()}`;
  const { status } = await api('/v1/topics', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: 'Topic', ...(channels ? { channels } : {}) }),
  });
  if (status !== 201) throw new Error(`topic create failed: ${status}`);
  return slug;
}

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('$subscriber.created', () => {
  it('PUT /v1/subscribers/:id emits it once, with the attributes, and a second PUT never re-emits it', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const created = await identify(keyBearer, externalId, { attributes: { plan: 'pro', seats: 3 } });
    expect(created.status).toBe(201);

    const [event] = await timelineOf(keyBearer, externalId, 1);
    expectSystemEvent(event, externalId, '$subscriber.created', {
      externalId,
      attributes: { plan: 'pro', seats: 3 },
    });
    expect(event?.sequence).toBe(1);
    expect(event?.timestamp).toBe(event?.receivedAt);

    const again = await identify(keyBearer, externalId, { attributes: { plan: 'pro', seats: 3 } });
    expect(again.status).toBe(200);
    const changed = await identify(keyBearer, externalId, { attributes: { plan: 'team' } });
    expect(changed.status).toBe(200);

    const items = await timelineOf(keyBearer, externalId, 2);
    expect(items).toHaveLength(2);
    expect(items.filter((item) => item.name === '$subscriber.created')).toHaveLength(1);
  });

  it('POST /v1/events creates the subscriber and puts $subscriber.created before the tracked event', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const tracked = await api<{ items: Array<{ id: string; sequence: number }> }>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'workout.completed', data: { duration: 42 } }),
    });
    expect(tracked.status).toBe(202);
    expect(tracked.body.data?.items).toHaveLength(1);
    expect(tracked.body.data?.items[0]?.sequence).toBe(2);

    const [first, second] = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expectSystemEvent(first, externalId, '$subscriber.created', { externalId, attributes: {} });
    expect(first?.sequence).toBe(1);
    expect(second).toMatchObject({
      id: tracked.body.data?.items[0]?.id,
      sequence: 2,
      name: 'workout.completed',
      source: 'server',
      externalId,
      data: { duration: 42 },
    });
  });

  it('POST /v1/client/identify emits it before $identify, and an unchanged re-identify emits nothing', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const identified = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    expect(identified.status).toBe(201);
    const attributes = identified.body.data?.attributes ?? {};

    const [created, identifyEvent] = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expectSystemEvent(created, externalId, '$subscriber.created', { externalId, attributes });
    expect(customAttributes(created?.data.attributes)).toEqual({});
    expectSystemEvent(identifyEvent, externalId, '$identify', { attributes });
    expect(created?.sequence).toBe(1);
    expect(identifyEvent?.sequence).toBe(2);

    const again = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    expect(again.status).toBe(200);
    expect(await timelineOf(keyBearer, externalId, 2)).toHaveLength(2);
  });

  it('POST /v1/client/events creates the subscriber and puts $subscriber.created before the first client event', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const tracked = await api<{ items: Array<{ sequence: number }> }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        source: 'ios',
        events: [{ name: '$app.opened' }, { name: 'screen.viewed' }],
      }),
    });
    expect(tracked.status).toBe(202);
    expect(tracked.body.data?.items.map((item) => item.sequence)).toEqual([2, 3]);

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 3));
    expect(items.map((item) => [item.sequence, item.name, item.source])).toEqual([
      [1, '$subscriber.created', 'system'],
      [2, '$app.opened', 'ios'],
      [3, 'screen.viewed', 'ios'],
    ]);
    expect(customAttributes(items[0]?.data.attributes)).toEqual({});
  });

  it('a registration through the server route or the client route emits it before $subscription.registered', async () => {
    const { clientBearer, keyBearer } = await setupClient();

    const viaServer = `user_${uniq()}`;
    const serverToken = fakeToken();
    const registeredServer = await register(keyBearer, {
      externalId: viaServer,
      channel: 'push',
      platform: 'ios',
      token: serverToken,
    });
    expect(registeredServer.status).toBe(201);

    const [serverCreated, serverRegistered] = oldestFirst(await timelineOf(keyBearer, viaServer, 2));
    expectSystemEvent(serverCreated, viaServer, '$subscriber.created', {
      externalId: viaServer,
      attributes: {},
    });
    expectSystemEvent(serverRegistered, viaServer, '$subscription.registered', {
      externalId: viaServer,
      channel: 'push',
      platform: 'ios',
      endpoint: serverToken,
    });

    const viaClient = `user_${uniq()}`;
    const clientToken = fakeToken();
    const registeredClient = await register(
      clientBearer,
      { externalId: viaClient, channel: 'push', platform: 'android', token: clientToken },
      '/v1/client/subscriptions'
    );
    expect(registeredClient.status).toBe(201);

    const [clientCreated, clientRegistered] = oldestFirst(await timelineOf(keyBearer, viaClient, 2));
    expect(clientCreated?.name).toBe('$subscriber.created');
    expect(clientCreated?.source).toBe('system');
    expect(clientCreated?.data.externalId).toBe(viaClient);
    expect(customAttributes(clientCreated?.data.attributes)).toEqual({});
    expectSystemEvent(clientRegistered, viaClient, '$subscription.registered', {
      externalId: viaClient,
      channel: 'push',
      platform: 'android',
      endpoint: clientToken,
    });
    expect(await timelineOf(keyBearer, viaClient, 2)).toHaveLength(2);
  });
});

describe('$subscriber.updated', () => {
  it('carries the attributes as stored: a PUT replaces the custom attributes instead of merging them', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro', locale: 'de' } });
    const updated = await identify(keyBearer, externalId, { attributes: { tier: 'gold' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data?.attributes).toEqual({ tier: 'gold' });

    const [created, event] = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expect(created?.name).toBe('$subscriber.created');
    expectSystemEvent(event, externalId, '$subscriber.updated', { externalId, attributes: { tier: 'gold' } });
    expect(event?.sequence).toBe(2);
  });

  it('an unchanged PUT, an attribute-less PUT and a same-value PUT emit nothing; clearing to {} emits one', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro' } });
    expect((await identify(keyBearer, externalId, { attributes: { plan: 'pro' } })).status).toBe(200);
    expect((await identify(keyBearer, externalId)).status).toBe(200);
    expect((await identify(keyBearer, externalId, {})).status).toBe(200);
    expect(await timelineOf(keyBearer, externalId, 1)).toHaveLength(1);

    const cleared = await identify(keyBearer, externalId, { attributes: {} });
    expect(cleared.status).toBe(200);
    const [, event] = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expectSystemEvent(event, externalId, '$subscriber.updated', { externalId, attributes: {} });

    expect((await identify(keyBearer, externalId, { attributes: {} })).status).toBe(200);
    expect(await timelineOf(keyBearer, externalId, 2)).toHaveLength(2);
  });

  it('a PUT that only adds an email emits $subscription.registered and no $subscriber.updated', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const address = `${externalId}@acme.test`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro' } });
    const withEmail = await identify(keyBearer, externalId, { email: address });
    expect(withEmail.status).toBe(200);
    expect(withEmail.body.data?.attributes).toEqual({ plan: 'pro' });

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expect(items.map((item) => item.name)).toEqual(['$subscriber.created', '$subscription.registered']);
    expectSystemEvent(items[1], externalId, '$subscription.registered', {
      externalId,
      channel: 'email',
      platform: null,
      endpoint: address,
    });

    await identify(keyBearer, externalId, { email: address });
    expect(await timelineOf(keyBearer, externalId, 2)).toHaveLength(2);
  });

  it('a device whose system attributes changed emits $identify with the merged attributes, never $subscriber.updated', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro' } });
    const fromDevice = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, 'cf-ipcountry': 'FR', 'accept-language': 'fr-FR,fr;q=0.8' },
      body: JSON.stringify({ externalId }),
    });
    expect(fromDevice.status).toBe(200);
    expect(fromDevice.body.data?.attributes).toMatchObject({ plan: 'pro', $language: 'fr-FR' });

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 2));
    expect(items.map((item) => item.name)).toEqual(['$subscriber.created', '$identify']);
    expectSystemEvent(items[1], externalId, '$identify', { attributes: fromDevice.body.data?.attributes });
    expect(items[1]?.data).toMatchObject({ attributes: { plan: 'pro', $language: 'fr-FR' } });
  });
});

describe('$subscriber.deleted', () => {
  it('DELETE records one $subscription.removed per live subscription, then $subscriber.deleted; the timeline 404s from then on', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const token = fakeToken();
    const address = `${externalId}@acme.test`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro' } });
    await register(keyBearer, { externalId, platform: 'ios', token });
    await register(keyBearer, { externalId, channel: 'email', address });
    expect(await timelineOf(keyBearer, externalId, 3)).toHaveLength(3);

    const deleted = await api<{ deleted: boolean }>(`/v1/subscribers/${externalId}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.deleted).toBe(true);

    const gone = await api(timelinePath(externalId), { headers: keyBearer });
    expect(gone.status).toBe(404);
    expect(
      (await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer })).status
    ).toBe(404);

    const stream = await eventually(
      async () => {
        const mine = async (name: string) => {
          const { body } = await api<TimelinePage>(`/v1/events?name=%24${name}`, { headers: keyBearer });
          return body.data?.items.filter((item) => item.externalId === externalId) ?? [];
        };
        const removed = await mine('subscription.removed');
        const [subscriberDeleted] = await mine('subscriber.deleted');
        return removed.length === 2 && subscriberDeleted
          ? { removed: oldestFirst(removed), subscriberDeleted }
          : undefined;
      },
      { timeoutMs: 60_000, label: 'the delete cascade on the tenant stream' }
    );

    expectSystemEvent(stream.subscriberDeleted, externalId, '$subscriber.deleted', { externalId });
    expect(stream.subscriberDeleted.sequence).toBe(6);
    expect(stream.removed.map((item) => item.sequence)).toEqual([4, 5]);
    const push = stream.removed.find((item) => item.data.channel === 'push');
    const email = stream.removed.find((item) => item.data.channel === 'email');
    expectSystemEvent(push, externalId, '$subscription.removed', {
      externalId,
      channel: 'push',
      platform: 'ios',
      endpoint: token,
    });
    expectSystemEvent(email, externalId, '$subscription.removed', {
      externalId,
      channel: 'email',
      platform: null,
      endpoint: address,
    });
  }, 90_000);

  it('re-creating a deleted subscriber starts a fresh timeline whose sequence 1 is $subscriber.created', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { attributes: { plan: 'pro' } });
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'workout.completed' }),
    });
    expect(await timelineOf(keyBearer, externalId, 2)).toHaveLength(2);
    await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer });

    const recreated = await identify(keyBearer, externalId, { attributes: { plan: 'free' } });
    expect(recreated.status).toBe(201);

    const items = await timelineOf(keyBearer, externalId, 1);
    expect(items).toHaveLength(1);
    expectSystemEvent(items[0], externalId, '$subscriber.created', {
      externalId,
      attributes: { plan: 'free' },
    });
    expect(items[0]?.sequence).toBe(1);
  });
});

describe('$subscription.registered', () => {
  it('names the device for push on ios and android: channel, platform and the token as endpoint', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const iosToken = fakeToken('i');
    const androidToken = fakeToken('g');

    await register(keyBearer, { externalId, channel: 'push', platform: 'ios', token: iosToken });
    await register(keyBearer, {
      externalId,
      platform: 'android',
      token: androidToken,
      environment: 'sandbox',
    });

    const [, ios, android] = oldestFirst(await timelineOf(keyBearer, externalId, 3));
    expectSystemEvent(ios, externalId, '$subscription.registered', {
      externalId,
      channel: 'push',
      platform: 'ios',
      endpoint: iosToken,
    });
    expectSystemEvent(android, externalId, '$subscription.registered', {
      externalId,
      channel: 'push',
      platform: 'android',
      endpoint: androidToken,
    });
    expect(ios?.sequence).toBe(2);
    expect(android?.sequence).toBe(3);
  });

  it('names the address for email with a null platform, through every route that registers one', async () => {
    const { clientBearer, keyBearer } = await setupClient();

    const viaSubscriptions = `user_${uniq()}`;
    const first = `${viaSubscriptions}@acme.test`;
    await register(keyBearer, { externalId: viaSubscriptions, channel: 'email', address: first });
    const [, fromSubscriptions] = oldestFirst(await timelineOf(keyBearer, viaSubscriptions, 2));
    expectSystemEvent(fromSubscriptions, viaSubscriptions, '$subscription.registered', {
      externalId: viaSubscriptions,
      channel: 'email',
      platform: null,
      endpoint: first,
    });

    const viaPut = `user_${uniq()}`;
    const second = `${viaPut}@acme.test`;
    expect((await identify(keyBearer, viaPut, { attributes: { plan: 'pro' }, email: second })).status).toBe(
      201
    );
    const putItems = oldestFirst(await timelineOf(keyBearer, viaPut, 2));
    expect(putItems.map((item) => item.name)).toEqual(['$subscriber.created', '$subscription.registered']);
    expectSystemEvent(putItems[1], viaPut, '$subscription.registered', {
      externalId: viaPut,
      channel: 'email',
      platform: null,
      endpoint: second,
    });

    const viaIdentify = `user_${uniq()}`;
    const third = `${viaIdentify}@acme.test`;
    const identified = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: viaIdentify, email: third }),
    });
    expect(identified.status).toBe(201);
    const identifyItems = oldestFirst(await timelineOf(keyBearer, viaIdentify, 3));
    expect(identifyItems.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$identify',
      '$subscription.registered',
    ]);
    expectSystemEvent(identifyItems[2], viaIdentify, '$subscription.registered', {
      externalId: viaIdentify,
      channel: 'email',
      platform: null,
      endpoint: third,
    });

    const viaClient = `user_${uniq()}`;
    const fourth = `${viaClient}@acme.test`;
    await register(
      clientBearer,
      { externalId: viaClient, channel: 'email', address: fourth },
      '/v1/client/subscriptions'
    );
    const [, fromClient] = oldestFirst(await timelineOf(keyBearer, viaClient, 2));
    expectSystemEvent(fromClient, viaClient, '$subscription.registered', {
      externalId: viaClient,
      channel: 'email',
      platform: null,
      endpoint: fourth,
    });
  });

  it('is emitted on every registration write: a platform or environment change, a reactivation and a move, never a refresh', async () => {
    const { keyBearer } = await setupWorkspace();
    const owner = `user_${uniq()}`;
    const next = `user_${uniq()}`;
    const token = fakeToken();
    const device = (externalId: string, platform: string) => ({
      externalId,
      channel: 'push',
      platform,
      endpoint: token,
    });

    expect((await register(keyBearer, { externalId: owner, platform: 'ios', token })).status).toBe(201);
    expect((await register(keyBearer, { externalId: owner, platform: 'ios', token })).status).toBe(200);
    expect(await timelineOf(keyBearer, owner, 2)).toHaveLength(2);

    const platformChanged = await register(keyBearer, { externalId: owner, platform: 'android', token });
    expect(platformChanged.status).toBe(200);
    expect(platformChanged.body.data?.platform).toBe('android');
    const afterPlatform = oldestFirst(await timelineOf(keyBearer, owner, 3));
    expect(afterPlatform).toHaveLength(3);
    expectSystemEvent(afterPlatform[2], owner, '$subscription.registered', device(owner, 'android'));

    const environmentChanged = await register(keyBearer, {
      externalId: owner,
      platform: 'android',
      environment: 'sandbox',
      token,
    });
    expect(environmentChanged.status).toBe(200);
    const afterEnvironment = oldestFirst(await timelineOf(keyBearer, owner, 4));
    expect(afterEnvironment).toHaveLength(4);
    expectSystemEvent(afterEnvironment[3], owner, '$subscription.registered', device(owner, 'android'));

    await db
      .update(tables.subscription)
      .set({ status: 'invalid', invalidatedAt: new Date(), invalidationReason: 'Unregistered' })
      .where(eq(tables.subscription.endpoint, token));
    const reactivated = await register(keyBearer, {
      externalId: owner,
      platform: 'android',
      environment: 'sandbox',
      token,
    });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data?.status).toBe('active');
    const afterReactivation = oldestFirst(await timelineOf(keyBearer, owner, 5));
    expect(afterReactivation).toHaveLength(5);
    expectSystemEvent(afterReactivation[4], owner, '$subscription.registered', device(owner, 'android'));

    const moved = await register(keyBearer, {
      externalId: next,
      platform: 'android',
      environment: 'sandbox',
      token,
    });
    expect(moved.status).toBe(200);
    const ownerAfterMove = oldestFirst(await timelineOf(keyBearer, owner, 6));
    expect(ownerAfterMove).toHaveLength(6);
    expectSystemEvent(ownerAfterMove[5], owner, '$subscription.removed', device(owner, 'android'));
    const nextItems = oldestFirst(await timelineOf(keyBearer, next, 2));
    expect(nextItems.map((item) => item.name)).toEqual(['$subscriber.created', '$subscription.registered']);
    expectSystemEvent(nextItems[1], next, '$subscription.registered', device(next, 'android'));

    expect(
      (await register(keyBearer, { externalId: next, platform: 'android', environment: 'sandbox', token }))
        .status
    ).toBe(200);
    expect(await timelineOf(keyBearer, next, 2)).toHaveLength(2);
    expect(await timelineOf(keyBearer, owner, 6)).toHaveLength(6);
  });

  it('a move through the client route needs a verified identity: unverified is a silent 409, verified records both sides', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupClient();
    const victim = `user_${uniq()}`;
    const attacker = `user_${uniq()}`;
    const newOwner = `user_${uniq()}`;
    const token = fakeToken();

    expect(
      (
        await register(
          clientBearer,
          { externalId: victim, platform: 'ios', token },
          '/v1/client/subscriptions'
        )
      ).status
    ).toBe(201);

    const hijack = await register(
      clientBearer,
      { externalId: attacker, platform: 'ios', token },
      '/v1/client/subscriptions'
    );
    expect(hijack.status).toBe(409);
    expect(hijack.body.error?.code).toBe('endpoint_owned');
    expect(await timelineOf(keyBearer, victim, 2)).toHaveLength(2);
    const attackerTimeline = await api<TimelinePage>(timelinePath(attacker), { headers: keyBearer });
    expect(attackerTimeline.status).toBe(404);

    const secret = await api<{ identitySecret: string }>('/v1/tenants/default/identity-secret', {
      headers: { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
    });
    const identityHash = createHmac('sha256', secret.body.data!.identitySecret)
      .update(newOwner)
      .digest('hex');
    const moved = await register(
      clientBearer,
      { externalId: newOwner, identityHash, platform: 'ios', token },
      '/v1/client/subscriptions'
    );
    expect(moved.status).toBe(200);

    const newOwnerItems = oldestFirst(await timelineOf(keyBearer, newOwner, 2));
    expect(newOwnerItems.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
    ]);
    expectSystemEvent(newOwnerItems[1], newOwner, '$subscription.registered', {
      externalId: newOwner,
      channel: 'push',
      platform: 'ios',
      endpoint: token,
    });

    const victimItems = oldestFirst(await timelineOf(keyBearer, victim, 3));
    expect(victimItems.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
      '$subscription.removed',
    ]);
    expectSystemEvent(victimItems[2], victim, '$subscription.removed', {
      externalId: victim,
      channel: 'push',
      platform: 'ios',
      endpoint: token,
    });
  });
});

describe('$subscription.muted, $subscription.unmuted, $subscription.removed', () => {
  it('carry the same device data as the registration, in call order, through the server route', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const token = fakeToken();
    const device = { externalId, channel: 'push', platform: 'ios', endpoint: token };

    const registered = await register(keyBearer, { externalId, platform: 'ios', token });
    const id = registered.body.data?.id;
    const patch = (enabled: boolean) =>
      api(`/v1/subscriptions/${id}`, {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ enabled }),
      });

    expect((await patch(false)).status).toBe(200);
    expect((await patch(true)).status).toBe(200);
    expect((await api(`/v1/subscriptions/${id}`, { method: 'DELETE', headers: keyBearer })).status).toBe(200);

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 5));
    expect(items.map((item) => [item.sequence, item.name])).toEqual([
      [1, '$subscriber.created'],
      [2, '$subscription.registered'],
      [3, '$subscription.muted'],
      [4, '$subscription.unmuted'],
      [5, '$subscription.removed'],
    ]);
    expectSystemEvent(items[2], externalId, '$subscription.muted', device);
    expectSystemEvent(items[3], externalId, '$subscription.unmuted', device);
    expectSystemEvent(items[4], externalId, '$subscription.removed', device);

    expect((await patch(false)).status).toBe(404);
    expect(await timelineOf(keyBearer, externalId, 5)).toHaveLength(5);
  });

  it('carry the same device data through the client route, bound to the calling subscriber', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const address = `${externalId}@acme.test`;
    const device = { externalId, channel: 'email', platform: null, endpoint: address };

    const registered = await register(
      clientBearer,
      { externalId, channel: 'email', address },
      '/v1/client/subscriptions'
    );
    const id = registered.body.data?.id;
    const own = { ...clientBearer, 'buzzkit-subscriber': externalId };

    expect(
      (
        await api(`/v1/client/subscriptions/${id}`, {
          method: 'PATCH',
          headers: own,
          body: '{"enabled":false}',
        })
      ).status
    ).toBe(200);
    expect(
      (
        await api(`/v1/client/subscriptions/${id}`, {
          method: 'PATCH',
          headers: own,
          body: '{"enabled":true}',
        })
      ).status
    ).toBe(200);
    expect((await api(`/v1/client/subscriptions/${id}`, { method: 'DELETE', headers: own })).status).toBe(
      200
    );

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 5));
    expect(items.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
      '$subscription.muted',
      '$subscription.unmuted',
      '$subscription.removed',
    ]);
    expectSystemEvent(items[2], externalId, '$subscription.muted', device);
    expectSystemEvent(items[3], externalId, '$subscription.unmuted', device);
    expectSystemEvent(items[4], externalId, '$subscription.removed', device);
  });

  it('are idempotent on the stream: a PATCH to the value already set emits nothing, on either route', async () => {
    const { clientBearer, keyBearer } = await setupClient();

    const viaServer = `user_${uniq()}`;
    const registered = await register(keyBearer, {
      externalId: viaServer,
      platform: 'ios',
      token: fakeToken(),
    });
    const patch = (enabled: boolean) =>
      api<{ enabled: boolean }>(`/v1/subscriptions/${registered.body.data?.id}`, {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ enabled }),
      });

    expect((await patch(true)).body.data?.enabled).toBe(true);
    expect(await timelineOf(keyBearer, viaServer, 2)).toHaveLength(2);
    expect((await patch(false)).body.data?.enabled).toBe(false);
    expect((await patch(false)).body.data?.enabled).toBe(false);
    expect(await timelineOf(keyBearer, viaServer, 3)).toHaveLength(3);
    expect((await patch(true)).body.data?.enabled).toBe(true);
    expect((await patch(true)).body.data?.enabled).toBe(true);
    const serverItems = oldestFirst(await timelineOf(keyBearer, viaServer, 4));
    expect(serverItems.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
      '$subscription.muted',
      '$subscription.unmuted',
    ]);

    const viaClient = `user_${uniq()}`;
    const clientRegistered = await register(
      clientBearer,
      { externalId: viaClient, platform: 'android', token: fakeToken() },
      '/v1/client/subscriptions'
    );
    const own = { ...clientBearer, 'buzzkit-subscriber': viaClient };
    const clientPatch = (enabled: boolean) =>
      api<{ enabled: boolean }>(`/v1/client/subscriptions/${clientRegistered.body.data?.id}`, {
        method: 'PATCH',
        headers: own,
        body: JSON.stringify({ enabled }),
      });
    expect((await clientPatch(true)).status).toBe(200);
    expect((await clientPatch(false)).status).toBe(200);
    expect((await clientPatch(false)).status).toBe(200);
    const clientItems = oldestFirst(await timelineOf(keyBearer, viaClient, 3));
    expect(clientItems.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$subscription.registered',
      '$subscription.muted',
    ]);
  });
});

describe('$subscription.invalidated', () => {
  it.skipIf(!APNS_REACHABLE)(
    'is emitted with the provider reason when a delivery settles as invalid (needs a reachable APNs)',
    async () => {
      const { keyBearer } = await setupWorkspace();
      const externalId = `user_${uniq()}`;
      const token = fakeToken('d');

      await register(keyBearer, { externalId, platform: 'ios', environment: 'sandbox', token });
      const sent = await api<{ id: string }>('/v1/messages', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ to: externalId, title: 'Hello', body: 'World' }),
      });
      expect(sent.status).toBe(202);

      const delivery = await eventually(
        async () => {
          const { body } = await api<{ items: Array<{ status: string; lastErrorMessage: string | null }> }>(
            `/v1/messages/${sent.body.data?.id}/deliveries`,
            { headers: keyBearer }
          );
          const [row] = body.data?.items ?? [];
          return row && row.status !== 'pending' ? row : undefined;
        },
        { label: 'delivery settled' }
      );
      expect(delivery.status).toBe('invalid');

      const items = await timelineOf(keyBearer, externalId, 3);
      const invalidated = items.find((item) => item.name === '$subscription.invalidated');
      expectSystemEvent(invalidated, externalId, '$subscription.invalidated', {
        externalId,
        channel: 'push',
        platform: 'ios',
        endpoint: token,
        reason: delivery.lastErrorMessage,
      });
      expect(typeof invalidated?.data.reason).toBe('string');
    },
    60_000
  );
});

describe('$preferences.updated', () => {
  it('carries the PATCH body as changes, in both shapes, only when a preference actually changed, never on a refused PATCH', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const gym = await createTopic(keyBearer);
    const digest = await createTopic(keyBearer, ['email']);
    await identify(keyBearer, externalId);

    const patch = (preferences: Record<string, unknown>) =>
      api(`/v1/subscribers/${externalId}/preferences`, {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ preferences }),
      });

    expect((await patch({ [gym]: { push: false } })).status).toBe(200);
    expect((await patch({ [gym]: { push: false } })).status).toBe(200);
    expect(await timelineOf(keyBearer, externalId, 2)).toHaveLength(2);

    expect((await patch({ [gym]: false, [digest]: { email: false } })).status).toBe(200);
    expect((await patch({ [gym]: false, [digest]: { email: false } })).status).toBe(200);
    expect(await timelineOf(keyBearer, externalId, 3)).toHaveLength(3);

    expect((await patch({ [gym]: false, [digest]: { email: true } })).status).toBe(200);

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 4));
    expect(items.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$preferences.updated',
      '$preferences.updated',
      '$preferences.updated',
    ]);
    expectSystemEvent(items[1], externalId, '$preferences.updated', { changes: { [gym]: { push: false } } });
    expectSystemEvent(items[2], externalId, '$preferences.updated', {
      changes: { [gym]: false, [digest]: { email: false } },
    });
    expectSystemEvent(items[3], externalId, '$preferences.updated', {
      changes: { [gym]: false, [digest]: { email: true } },
    });

    expect((await patch({ [`missing-${uniq()}`]: false })).status).toBe(404);
    expect((await patch({ [digest]: { push: false } })).status).toBe(400);
    expect(await timelineOf(keyBearer, externalId, 4)).toHaveLength(4);
  });

  it('carries the PATCH body as changes through the client route', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const gym = await createTopic(keyBearer);

    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    const patched = await api('/v1/client/preferences', {
      method: 'PATCH',
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
      body: JSON.stringify({ preferences: { [gym]: { push: false, email: true } } }),
    });
    expect(patched.status).toBe(200);

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 3));
    expect(items.map((item) => item.name)).toEqual([
      '$subscriber.created',
      '$identify',
      '$preferences.updated',
    ]);
    expectSystemEvent(items[2], externalId, '$preferences.updated', {
      changes: { [gym]: { push: false, email: true } },
    });
  });
});

describe('$identify', () => {
  it('is written by POST /v1/client/identify with source system, and by POST /v1/client/events with the platform as source', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const identified = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    expect(identified.status).toBe(201);

    const tracked = await api<{ items: Array<{ id: string; sequence: number; source: string }> }>(
      '/v1/client/events',
      {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({
          externalId,
          source: 'ios',
          events: [{ name: '$identify', data: { attributes: { plan: 'pro' } } }],
        }),
      }
    );
    expect(tracked.status).toBe(202);
    expect(tracked.body.data?.items[0]?.source).toBe('ios');

    const items = oldestFirst(await timelineOf(keyBearer, externalId, 3));
    expect(items.map((item) => [item.sequence, item.name, item.source])).toEqual([
      [1, '$subscriber.created', 'system'],
      [2, '$identify', 'system'],
      [3, '$identify', 'ios'],
    ]);
    expect(items[1]?.data).toEqual({ attributes: identified.body.data?.attributes });
    expect(items[2]).toMatchObject({
      id: tracked.body.data?.items[0]?.id,
      data: { attributes: { plan: 'pro' } },
    });

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(customAttributes(subscriber.body.data?.attributes)).toEqual({});
  });
});

describe('ordering across sources', () => {
  it('sequences increase strictly in call order across server, client and system events, starting at 1', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const token = fakeToken();
    const gym = await createTopic(keyBearer);
    const own = { ...clientBearer, 'buzzkit-subscriber': externalId };

    expect((await identify(keyBearer, externalId, { attributes: { plan: 'pro' } })).status).toBe(201);
    const server = await api<{ items: Array<{ sequence: number }> }>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'order.placed', data: { total: 10 } }),
    });
    const client = await api<{ items: Array<{ sequence: number }> }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        source: 'android',
        events: [{ name: '$app.opened' }, { name: 'cart.viewed' }],
      }),
    });
    expect((await identify(keyBearer, externalId, { attributes: { plan: 'team' } })).status).toBe(200);
    const registered = await register(
      clientBearer,
      { externalId, platform: 'android', token },
      '/v1/client/subscriptions'
    );
    await api('/v1/client/preferences', {
      method: 'PATCH',
      headers: own,
      body: JSON.stringify({ preferences: { [gym]: false } }),
    });
    await api(`/v1/client/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: own,
      body: '{"enabled":false}',
    });
    const late = await api<{ items: Array<{ sequence: number }> }>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'order.shipped' }),
    });

    expect(server.body.data?.items[0]?.sequence).toBe(2);
    expect(client.body.data?.items.map((item) => item.sequence)).toEqual([3, 4]);
    expect(late.body.data?.items[0]?.sequence).toBe(9);

    const items = await timelineOf(keyBearer, externalId, 9);
    expect(items.map((item) => item.sequence)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(oldestFirst(items).map((item) => [item.name, item.source])).toEqual([
      ['$subscriber.created', 'system'],
      ['order.placed', 'server'],
      ['$app.opened', 'android'],
      ['cart.viewed', 'android'],
      ['$subscriber.updated', 'system'],
      ['$subscription.registered', 'system'],
      ['$preferences.updated', 'system'],
      ['$subscription.muted', 'system'],
      ['order.shipped', 'server'],
    ]);
    for (const item of items) expect(item.externalId).toBe(externalId);
    const receivedAt = oldestFirst(items).map((item) => new Date(item.receivedAt).getTime());
    for (let index = 1; index < receivedAt.length; index += 1) {
      expect(receivedAt[index]).toBeGreaterThanOrEqual(receivedAt[index - 1]!);
    }
  });
});
