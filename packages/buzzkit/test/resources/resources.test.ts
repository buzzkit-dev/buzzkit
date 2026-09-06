import { describe, expect, it } from 'vitest';
import { BuzzKit } from '../../src/server/buzzkit';
import { envelope, page, type Stub, stub } from '../utils/stub';

type Call = { method: string; url: string; body?: unknown };

function client(source: Stub) {
  return new BuzzKit({ apiKey: 'bk_ws_k', baseUrl: 'https://api.test', fetch: source.fetch });
}

async function record(invoke: (buzzkit: BuzzKit) => Promise<unknown>, responses = 1): Promise<Call> {
  const source = stub(Array.from({ length: responses }, () => envelope({})));
  await invoke(client(source));

  const [call] = source.calls;
  return { method: call?.method ?? '', url: call?.url ?? '', body: call?.body };
}

async function recordList(invoke: (buzzkit: BuzzKit) => Promise<unknown>): Promise<Call> {
  const source = stub([page([])]);
  await invoke(client(source));

  const [call] = source.calls;
  return { method: call?.method ?? '', url: call?.url ?? '', body: call?.body };
}

const base = 'https://api.test';

describe('messages', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.messages.list({ status: 'queued' }))).resolves.toMatchObject({
      method: 'GET',
      url: `${base}/v1/messages?status=queued`,
    });
    await expect(record((b) => b.messages.retrieve('msg_1'))).resolves.toMatchObject({
      method: 'GET',
      url: `${base}/v1/messages/msg_1`,
    });
    await expect(record((b) => b.messages.cancel('msg_1'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/messages/msg_1/cancel`,
    });
    await expect(
      recordList((b) => b.messages.deliveries('msg_1', { status: 'sent' }))
    ).resolves.toMatchObject({ method: 'GET', url: `${base}/v1/messages/msg_1/deliveries?status=sent` });
  });
});

describe('subscribers and subscriptions', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.subscribers.list({ search: 'ada' }))).resolves.toMatchObject({
      url: `${base}/v1/subscribers?search=ada`,
    });
    await expect(record((b) => b.subscribers.upsert('u1', { email: 'a@b.c' }))).resolves.toMatchObject({
      method: 'PUT',
      url: `${base}/v1/subscribers/u1`,
      body: { email: 'a@b.c' },
    });
    await expect(record((b) => b.subscribers.remove('u1'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(
      record((b) => b.subscriptions.create({ externalId: 'u1', token: 't' }))
    ).resolves.toMatchObject({ method: 'POST', url: `${base}/v1/subscriptions` });
    await expect(record((b) => b.subscriptions.update('sbn_1', { enabled: false }))).resolves.toMatchObject({
      method: 'PATCH',
      url: `${base}/v1/subscriptions/sbn_1`,
      body: { enabled: false },
    });
    await expect(record((b) => b.subscriptions.remove('sbn_1'))).resolves.toMatchObject({ method: 'DELETE' });
  });

  it('lists and adds the ids a subscriber has been known by', async () => {
    await expect(recordList((b) => b.subscribers.aliases('u1'))).resolves.toMatchObject({
      method: 'GET',
      url: `${base}/v1/subscribers/u1/aliases`,
    });
    await expect(recordList((b) => b.subscribers.addAlias('u1', 'legacy_7'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/subscribers/u1/aliases`,
      body: { externalId: 'legacy_7' },
    });
  });

  it('returns every alias the API answers with', async () => {
    const alias = { externalId: 'legacy_7', source: 'manual', createdAt: '2026-09-06T00:00:00.000Z' };
    const source = stub([page([alias])]);

    const aliases = await client(source).subscribers.aliases('u1');

    expect(aliases.items).toEqual([alias]);
  });
});

describe('topics', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.topics.list())).resolves.toMatchObject({ url: `${base}/v1/topics` });
    await expect(record((b) => b.topics.create({ slug: 't', name: 'T' }))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/topics`,
    });
    await expect(record((b) => b.topics.retrieve('t'))).resolves.toMatchObject({
      url: `${base}/v1/topics/t`,
    });
    await expect(record((b) => b.topics.update('t', { name: 'U' }))).resolves.toMatchObject({
      method: 'PATCH',
    });
    await expect(record((b) => b.topics.remove('t'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(recordList((b) => b.topicCategories.list())).resolves.toMatchObject({
      url: `${base}/v1/topic-categories`,
    });
    await expect(record((b) => b.topicCategories.update('cat_1', { name: 'N' }))).resolves.toMatchObject({
      method: 'PATCH',
      url: `${base}/v1/topic-categories/cat_1`,
    });
    await expect(record((b) => b.topicCategories.remove('cat_1'))).resolves.toMatchObject({
      method: 'DELETE',
    });
  });
});

describe('segments', () => {
  it('maps every method onto its route', async () => {
    const expression = { ref: 'attributes.plan', eq: 'pro' } as const;

    await expect(recordList((b) => b.segments.list())).resolves.toMatchObject({ url: `${base}/v1/segments` });
    await expect(
      record((b) => b.segments.create({ slug: 's', name: 'S', expression }))
    ).resolves.toMatchObject({ method: 'POST', url: `${base}/v1/segments` });
    await expect(record((b) => b.segments.preview(expression))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/segments/preview`,
      body: { expression },
    });
    await expect(record((b) => b.segments.retrieve('s'))).resolves.toMatchObject({
      url: `${base}/v1/segments/s`,
    });
    await expect(record((b) => b.segments.update('s', { name: 'S2' }))).resolves.toMatchObject({
      method: 'PATCH',
    });
    await expect(record((b) => b.segments.remove('s'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(recordList((b) => b.segments.members('s'))).resolves.toMatchObject({
      url: `${base}/v1/segments/s/members`,
    });
  });
});

describe('workflows and runs', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.workflows.list())).resolves.toMatchObject({
      url: `${base}/v1/workflows`,
    });
    await expect(
      record((b) =>
        b.workflows.create({ slug: 'w', name: 'W', spec: { trigger: { event: 'signup' }, steps: [] } })
      )
    ).resolves.toMatchObject({ method: 'POST' });
    await expect(record((b) => b.workflows.retrieve('w'))).resolves.toMatchObject({
      url: `${base}/v1/workflows/w`,
    });
    await expect(record((b) => b.workflows.update('w', { name: 'W2' }))).resolves.toMatchObject({
      method: 'PATCH',
    });
    await expect(record((b) => b.workflows.remove('w'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(record((b) => b.workflows.publish('w'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/workflows/w/publish`,
    });
    await expect(record((b) => b.workflows.pause('w'))).resolves.toMatchObject({
      url: `${base}/v1/workflows/w/pause`,
    });
    await expect(record((b) => b.workflows.schedule('w'))).resolves.toMatchObject({
      url: `${base}/v1/workflows/w/schedule`,
    });
    await expect(record((b) => b.workflows.test('w', { externalId: 'u1' }))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/workflows/w/test`,
      body: { externalId: 'u1' },
    });
    await expect(recordList((b) => b.workflows.runs('w', { status: 'running' }))).resolves.toMatchObject({
      url: `${base}/v1/workflows/w/runs?status=running`,
    });
    await expect(recordList((b) => b.runs.list({ workflow: 'w' }))).resolves.toMatchObject({
      url: `${base}/v1/runs?workflow=w`,
    });
    await expect(record((b) => b.runs.retrieve('run_1'))).resolves.toMatchObject({
      url: `${base}/v1/runs/run_1`,
    });
  });
});

describe('events, stats and deliveries', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.events.list({ name: 'a.b' }))).resolves.toMatchObject({
      url: `${base}/v1/events?name=a.b`,
    });
    await expect(recordList((b) => b.events.names())).resolves.toMatchObject({
      url: `${base}/v1/events/names`,
    });
    await expect(record((b) => b.events.name('a.b', { range: '7d' }))).resolves.toMatchObject({
      url: `${base}/v1/events/names/a.b?range=7d`,
    });
    await expect(record((b) => b.events.volume({ range: '24h' }))).resolves.toMatchObject({
      url: `${base}/v1/events/volume?range=24h`,
    });
    await expect(record((b) => b.stats.retrieve({ interval: 'day' }))).resolves.toMatchObject({
      url: `${base}/v1/stats?interval=day`,
    });
    await expect(record((b) => b.deliveries.retrieve('dlv_1'))).resolves.toMatchObject({
      url: `${base}/v1/deliveries/dlv_1`,
    });
    await expect(recordList((b) => b.deliveries.attempts('dlv_1'))).resolves.toMatchObject({
      url: `${base}/v1/deliveries/dlv_1/attempts`,
    });
  });
});

describe('credentials, secrets and sources', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.credentials.list())).resolves.toMatchObject({
      url: `${base}/v1/credentials`,
    });
    await expect(
      record((b) => b.credentials.create({ provider: 'resend', apiKey: 're_1' }))
    ).resolves.toMatchObject({ method: 'POST', body: { provider: 'resend', apiKey: 're_1' } });
    await expect(record((b) => b.credentials.validate('crd_1'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/credentials/crd_1/validate`,
    });
    await expect(record((b) => b.credentials.remove('crd_1'))).resolves.toMatchObject({ method: 'DELETE' });
    const apns = [
      { id: 'crd_1', environment: 'sandbox' },
      { id: 'crd_2', environment: 'production' },
    ];
    const created = await client(stub([page(apns)])).credentials.create({
      provider: 'apns',
      p8: 'k',
      teamId: 't',
      keyId: 'k',
      bundleId: 'b',
    });
    expect(created).toEqual(apns);
    await expect(record((b) => b.secrets.upsert('stripe', 'sk_1'))).resolves.toMatchObject({
      method: 'PUT',
      url: `${base}/v1/secrets/stripe`,
      body: { value: 'sk_1' },
    });
    await expect(record((b) => b.secrets.retrieve('stripe'))).resolves.toMatchObject({
      url: `${base}/v1/secrets/stripe`,
    });
    await expect(record((b) => b.secrets.remove('stripe'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(record((b) => b.sources.create({ name: 'S', provider: 'stripe' }))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/sources`,
    });
    await expect(record((b) => b.sources.preview('src_1', { payload: {} }))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/sources/src_1/preview`,
    });
    await expect(
      recordList((b) => b.sources.deliveries('src_1', { outcome: 'event' }))
    ).resolves.toMatchObject({ url: `${base}/v1/sources/src_1/deliveries?outcome=event` });
  });
});

describe('imports, live activities and tenants', () => {
  it('maps every method onto its route', async () => {
    await expect(record((b) => b.imports.create([{ externalId: 'u1' }]))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/imports`,
      body: { rows: [{ externalId: 'u1' }] },
    });
    await expect(
      record((b) => b.liveActivities.send({ to: 'u1', event: 'update', contentState: { score: 1 } }))
    ).resolves.toMatchObject({ method: 'POST', url: `${base}/v1/live-activities/send` });
    await expect(recordList((b) => b.tenants.list())).resolves.toMatchObject({ url: `${base}/v1/tenants` });
    await expect(record((b) => b.tenants.create({ name: 'T', slug: 't' }))).resolves.toMatchObject({
      method: 'POST',
    });
    await expect(record((b) => b.tenants.retrieve('t'))).resolves.toMatchObject({
      url: `${base}/v1/tenants/t`,
    });
    await expect(record((b) => b.tenants.update('t', { name: 'T2' }))).resolves.toMatchObject({
      method: 'PATCH',
    });
    await expect(record((b) => b.tenants.remove('t'))).resolves.toMatchObject({ method: 'DELETE' });
  });
});

describe('workspaces and webhooks', () => {
  it('maps every method onto its route', async () => {
    await expect(recordList((b) => b.workspaces.list())).resolves.toMatchObject({
      url: `${base}/v1/workspaces`,
    });
    await expect(record((b) => b.workspaces.create({ name: 'W', slug: 'w' }))).resolves.toMatchObject({
      method: 'POST',
    });
    await expect(record((b) => b.workspaces.retrieve('w'))).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w`,
    });
    await expect(record((b) => b.workspace('w').update({ name: 'W2' }))).resolves.toMatchObject({
      method: 'PATCH',
      url: `${base}/v1/workspaces/w`,
    });
    await expect(
      record((b) => b.workspace('w').webhooks.create({ url: 'https://x.test' }))
    ).resolves.toMatchObject({ method: 'POST', url: `${base}/v1/workspaces/w/webhooks` });
    await expect(record((b) => b.workspace('w').webhooks.catalog())).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/webhooks/catalog`,
    });
    await expect(record((b) => b.workspace('w').webhooks.rotate('wh_1'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/workspaces/w/webhooks/wh_1/rotate`,
    });
    await expect(record((b) => b.workspace('w').webhooks.event('whe_1'))).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/webhooks/events/whe_1`,
    });
    await expect(record((b) => b.workspace('w').webhooks.delivery('wh_1', 'whd_1'))).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/webhooks/wh_1/deliveries/whd_1`,
    });
    await expect(record((b) => b.workspace('w').webhooks.replay('wh_1', 'whd_1'))).resolves.toMatchObject({
      method: 'POST',
      url: `${base}/v1/workspaces/w/webhooks/wh_1/deliveries/whd_1/replay`,
    });
    await expect(record((b) => b.workspace('w').members.retrieve('mem_1'))).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/members/mem_1`,
    });
    await expect(
      recordList((b) => b.workspace('w').audit.list({ event: 'tenant.created' }))
    ).resolves.toMatchObject({ url: `${base}/v1/workspaces/w/audit?event=tenant.created` });
  });
});

describe('the remaining reads and writes', () => {
  it('maps every method onto its route', async () => {
    await expect(record((b) => b.credentials.retrieve('crd_1'))).resolves.toMatchObject({
      url: `${base}/v1/credentials/crd_1`,
    });
    await expect(recordList((b) => b.secrets.list())).resolves.toMatchObject({ url: `${base}/v1/secrets` });
    await expect(recordList((b) => b.sources.list())).resolves.toMatchObject({ url: `${base}/v1/sources` });
    await expect(record((b) => b.sources.retrieve('src_1'))).resolves.toMatchObject({
      url: `${base}/v1/sources/src_1`,
    });
    await expect(record((b) => b.sources.update('src_1', { status: 'paused' }))).resolves.toMatchObject({
      method: 'PATCH',
      body: { status: 'paused' },
    });
    await expect(record((b) => b.sources.remove('src_1'))).resolves.toMatchObject({ method: 'DELETE' });
    await expect(record((b) => b.subscriptions.retrieve('sbn_1'))).resolves.toMatchObject({
      url: `${base}/v1/subscriptions/sbn_1`,
    });
    await expect(record((b) => b.workspace('w').retrieve())).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w`,
    });
    await expect(record((b) => b.workspace('w').webhooks.retrieve('wh_1'))).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/webhooks/wh_1`,
    });
    await expect(
      record((b) => b.workspace('w').webhooks.update('wh_1', { enabled: false }))
    ).resolves.toMatchObject({ method: 'PATCH', body: { enabled: false } });
    await expect(record((b) => b.workspace('w').webhooks.remove('wh_1'))).resolves.toMatchObject({
      method: 'DELETE',
    });
    await expect(
      recordList((b) => b.workspace('w').webhooks.deliveries('wh_1', { status: 'failed' }))
    ).resolves.toMatchObject({ url: `${base}/v1/workspaces/w/webhooks/wh_1/deliveries?status=failed` });
    await expect(recordList((b) => b.workspace('w').webhooks.list())).resolves.toMatchObject({
      url: `${base}/v1/workspaces/w/webhooks`,
    });
  });
});
