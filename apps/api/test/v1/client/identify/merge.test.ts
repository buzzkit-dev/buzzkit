import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { and, db, eq, isNull, tables, tenantIdFor } from '../../../utils/db';
import { eventually } from '../../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';
import { publish, runEvents, track as trackServer } from '../../../utils/workflows';

type SubscriberBody = { id: string; externalId: string; attributes: Record<string, unknown> };

type Detail = {
  id: string;
  externalId: string;
  attributes: Record<string, unknown>;
  subscriptions: { channel: string; endpoint: string; platform: string | null }[];
};

type TimelineEvent = { name: string; data: Record<string, unknown> };

type TopicPreference = { slug: string; channels: Record<string, { optedIn: boolean }> };

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

function anonymousId(): string {
  return `anon_${uniq()}`;
}

async function registerPush(
  clientBearer: Record<string, string>,
  externalId: string,
  token: string
): Promise<number> {
  const { status } = await api('/v1/client/subscriptions', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token }),
  });
  return status;
}

async function track(
  clientBearer: Record<string, string>,
  externalId: string,
  names: string[]
): Promise<void> {
  const { status } = await api('/v1/client/events', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify({
      externalId,
      source: 'ios',
      events: names.map((name) => ({ name })),
    }),
  });
  expect(status).toBe(202);
}

async function identify(
  clientBearer: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ status: number; data: SubscriberBody | null; code?: string }> {
  const response = await api<SubscriberBody>('/v1/client/identify', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify(body),
  });
  return { status: response.status, data: response.body.data, code: response.body.error?.code };
}

async function detailOf(
  keyBearer: Record<string, string>,
  externalId: string
): Promise<{ status: number; data: Detail | null }> {
  const { status, body } = await api<Detail>(`/v1/subscribers/${externalId}`, { headers: keyBearer });
  return { status, data: body.data };
}

async function aliasesOf(
  keyBearer: Record<string, string>,
  externalId: string
): Promise<{ externalId: string; source: string }[]> {
  const { body } = await api<{ items: { externalId: string; source: string }[] }>(
    `/v1/subscribers/${externalId}/aliases`,
    { headers: keyBearer }
  );
  return body.data?.items ?? [];
}

async function timelineOf(keyBearer: Record<string, string>, externalId: string): Promise<TimelineEvent[]> {
  const { body } = await api<{ items: TimelineEvent[] }>(`/v1/subscribers/${externalId}/timeline?limit=100`, {
    headers: keyBearer,
  });
  return body.data?.items ?? [];
}

async function createTopic(keyBearer: Record<string, string>, slug: string): Promise<void> {
  const { status } = await api('/v1/topics', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ slug, name: slug, channels: ['push'], defaultOptedIn: true }),
  });
  expect(status).toBe(201);
}

async function setPreference(
  clientBearer: Record<string, string>,
  externalId: string,
  slug: string,
  optedIn: boolean
): Promise<void> {
  const { status } = await api('/v1/client/preferences', {
    method: 'PATCH',
    headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
    body: JSON.stringify({ preferences: { [slug]: { push: optedIn } } }),
  });
  expect(status).toBe(200);
}

async function preferencesOf(
  clientBearer: Record<string, string>,
  externalId: string
): Promise<TopicPreference[]> {
  const { body } = await api<{ items: TopicPreference[] }>('/v1/client/preferences', {
    headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
  });
  return body.data?.items ?? [];
}

function optedInFor(preferences: TopicPreference[], slug: string): boolean | undefined {
  return preferences.find((preference) => preference.slug === slug)?.channels.push?.optedIn;
}

async function startActivity(
  clientBearer: Record<string, string>,
  externalId: string,
  activityId: string
): Promise<number> {
  const { status } = await api('/v1/client/live-activities', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify({
      externalId,
      activityId,
      attributesType: 'MatchAttributes',
      token: 'a'.repeat(64),
      environment: 'sandbox',
    }),
  });
  return status;
}

async function activitiesOf(workspaceSlug: string, externalId: string): Promise<(string | null)[]> {
  const tenantId = await tenantIdFor(workspaceSlug);
  const rows = await db
    .select({ activityId: tables.liveActivity.activityId })
    .from(tables.liveActivity)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.liveActivity.subscriberId))
    .where(
      and(
        eq(tables.subscriber.tenantId, tenantId),
        eq(tables.subscriber.externalId, externalId),
        isNull(tables.liveActivity.deletedAt)
      )
    )
    .orderBy(tables.liveActivity.id);
  return rows.map((row) => row.activityId);
}

async function deliveriesOf(keyBearer: Record<string, string>, externalId: string): Promise<number> {
  const { body } = await api<{ items: unknown[] }>(`/v1/subscribers/${externalId}/deliveries`, {
    headers: keyBearer,
  });
  return body.data?.items.length ?? 0;
}

describe('POST /v1/client/identify — anonymous merge', () => {
  it('carries the anonymous device subscription onto the identified subscriber', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;
    const token = `tok_${uniq()}`;

    expect(await registerPush(clientBearer, anon, token)).toBe(201);

    const identified = await identify(clientBearer, { externalId, anonymousId: anon });
    expect(identified.status).toBe(200);
    expect(identified.data?.externalId).toBe(externalId);

    const detail = await detailOf(keyBearer, externalId);
    expect(detail.status).toBe(200);
    expect(detail.data?.subscriptions.map((entry) => entry.endpoint)).toEqual([token]);

    const aliases = await aliasesOf(keyBearer, externalId);
    expect(aliases.map((alias) => alias.externalId)).toEqual([anon]);
    expect(aliases[0]?.source).toBe('system');
  });

  it('keeps the anonymous id resolvable, so a stale client reaches the same subscriber', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;

    await track(clientBearer, anon, ['before.signup']);
    const identified = await identify(clientBearer, { externalId, anonymousId: anon });

    const byAlias = await detailOf(keyBearer, anon);
    expect(byAlias.status).toBe(200);
    expect(byAlias.data?.externalId).toBe(externalId);
    expect(byAlias.data?.id).toBe(identified.data?.id);

    await track(clientBearer, anon, ['after.signup']);
    const timeline = await timelineOf(keyBearer, externalId);
    expect(timeline.map((event) => event.name)).toContain('after.signup');
  });

  it('keeps the same subscriber row so the whole event history follows the identity', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;

    await track(clientBearer, anon, ['onboarding.started', 'onboarding.completed']);
    const before = await identify(clientBearer, { externalId: anon });
    expect(before.status).toBe(200);

    const identified = await identify(clientBearer, { externalId, anonymousId: anon });
    expect(identified.data?.id).toBe(before.data?.id);

    const timeline = await timelineOf(keyBearer, externalId);
    const names = timeline.map((event) => event.name);
    expect(names).toContain('onboarding.started');
    expect(names).toContain('onboarding.completed');
  });

  it('records a merge event naming the anonymous id it came from', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;

    await track(clientBearer, anon, ['app.launched']);
    await identify(clientBearer, { externalId, anonymousId: anon });

    const timeline = await timelineOf(keyBearer, externalId);
    const merged = timeline.find((event) => event.name === '$subscriber.merged');
    expect(merged).toBeDefined();
    expect(merged?.data.from).toBe(anon);
  });

  it('absorbs the anonymous subscriber when the identified one already exists', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const firstToken = `tok_${uniq()}`;
    const secondToken = `tok_${uniq()}`;
    const secondAnon = anonymousId();

    await registerPush(clientBearer, externalId, firstToken);
    await identify(clientBearer, { externalId });

    await registerPush(clientBearer, secondAnon, secondToken);
    await track(clientBearer, secondAnon, ['second.device.opened']);

    const identified = await identify(clientBearer, { externalId, anonymousId: secondAnon });
    expect(identified.status).toBe(200);

    const detail = await detailOf(keyBearer, externalId);
    const endpoints = detail.data?.subscriptions.map((entry) => entry.endpoint) ?? [];
    expect(endpoints).toContain(firstToken);
    expect(endpoints).toContain(secondToken);

    const byAlias = await detailOf(keyBearer, secondAnon);
    expect(byAlias.status).toBe(200);
    expect(byAlias.data?.externalId).toBe(externalId);
    expect((await aliasesOf(keyBearer, externalId)).map((alias) => alias.externalId)).toContain(secondAnon);

    const timeline = await timelineOf(keyBearer, externalId);
    const merged = timeline.find((event) => event.name === '$subscriber.merged');
    expect(merged?.data.from).toBe(secondAnon);
  });

  it('keeps the topic choices made before signing up', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;
    const slug = `topic-${uniq()}`;

    await createTopic(keyBearer, slug);
    await identify(clientBearer, { externalId: anon });
    await setPreference(clientBearer, anon, slug, false);

    await identify(clientBearer, { externalId, anonymousId: anon });

    expect(optedInFor(await preferencesOf(clientBearer, externalId), slug)).toBe(false);
  });

  it('carries the anonymous topic choices into an existing identified subscriber', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const anon = anonymousId();
    const carried = `topic-${uniq()}`;
    const kept = `topic-${uniq()}`;

    await createTopic(keyBearer, carried);
    await createTopic(keyBearer, kept);

    await identify(clientBearer, { externalId });
    await identify(clientBearer, { externalId: anon });
    await setPreference(clientBearer, externalId, kept, false);
    await setPreference(clientBearer, anon, carried, false);

    await identify(clientBearer, { externalId, anonymousId: anon });

    const preferences = await preferencesOf(clientBearer, externalId);
    expect(optedInFor(preferences, carried)).toBe(false);
    expect(optedInFor(preferences, kept)).toBe(false);
  });

  it('lets the newer choice win when both identities set the same topic', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const anon = anonymousId();
    const slug = `topic-${uniq()}`;

    await createTopic(keyBearer, slug);
    await identify(clientBearer, { externalId });
    await identify(clientBearer, { externalId: anon });
    await setPreference(clientBearer, externalId, slug, false);
    await setPreference(clientBearer, anon, slug, true);

    await identify(clientBearer, { externalId, anonymousId: anon });

    expect(optedInFor(await preferencesOf(clientBearer, externalId), slug)).toBe(true);
  });

  it('is idempotent when the app identifies again with the same anonymous id', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const externalId = `user_${uniq()}`;
    const token = `tok_${uniq()}`;

    await registerPush(clientBearer, anon, token);
    const first = await identify(clientBearer, { externalId, anonymousId: anon });
    const second = await identify(clientBearer, { externalId, anonymousId: anon });
    const third = await identify(clientBearer, { externalId, anonymousId: anon });

    expect(second.status).toBe(200);
    expect(third.data?.id).toBe(first.data?.id);

    const detail = await detailOf(keyBearer, externalId);
    expect(detail.data?.subscriptions.map((entry) => entry.endpoint)).toEqual([token]);

    const timeline = await timelineOf(keyBearer, externalId);
    const merges = timeline.filter((event) => event.name === '$subscriber.merged');
    expect(merges).toHaveLength(1);
  });

  it('does nothing when the anonymous id was never seen', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const identified = await identify(clientBearer, { externalId, anonymousId: anonymousId() });
    expect(identified.status).toBe(201);

    const timeline = await timelineOf(keyBearer, externalId);
    expect(timeline.filter((event) => event.name === '$subscriber.merged')).toHaveLength(0);
  });

  it('refuses to merge a subscriber that is not anonymous', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const victim = `user_${uniq()}`;
    const attacker = `user_${uniq()}`;
    const token = `tok_${uniq()}`;

    await registerPush(clientBearer, victim, token);

    const identified = await identify(clientBearer, { externalId: attacker, anonymousId: victim });
    expect(identified.status).toBe(409);
    expect(identified.code).toBe('merge_source_identified');

    const detail = await detailOf(keyBearer, victim);
    expect(detail.data?.subscriptions.map((entry) => entry.endpoint)).toEqual([token]);
  });

  it('carries a live activity started while anonymous onto the identified subscriber', async () => {
    const { clientBearer, workspace } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect(await startActivity(clientBearer, anon, 'match_1')).toBe(201);

    const identified = await identify(clientBearer, { externalId: user, anonymousId: anon });
    expect(identified.status).toBe(200);

    expect(await activitiesOf(workspace.slug, user)).toEqual(['match_1']);
  });

  it('keeps only the identified subscriber activity when both hold the same one', async () => {
    const { clientBearer, workspace } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect(await startActivity(clientBearer, anon, 'match_1')).toBe(201);
    expect(await startActivity(clientBearer, user, 'match_1')).toBe(201);

    expect((await identify(clientBearer, { externalId: user, anonymousId: anon })).status).toBe(200);

    expect(await activitiesOf(workspace.slug, user)).toEqual(['match_1']);
  });

  it('carries what was sent before the merge into the identified deliveries list', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect(await registerPush(clientBearer, anon, `tok_${uniq()}`)).toBe(201);

    const sent = await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ title: 'Welcome back', body: 'Your cart is waiting', to: anon }),
    });
    expect(sent.status).toBe(202);
    await eventually(async () => (await deliveriesOf(keyBearer, anon)) === 1, {
      label: 'the anonymous delivery landed',
      timeoutMs: 30_000,
      intervalMs: 300,
    });

    expect((await identify(clientBearer, { externalId: user, anonymousId: anon })).status).toBe(200);

    expect(await deliveriesOf(keyBearer, user)).toBe(1);
  });

  it('keeps a waiting run alive when the anonymous subscriber is only renamed', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect(await registerPush(clientBearer, anon, `tok_${uniq()}`)).toBe(201);
    await publish(keyBearer, `renamed-${uniq()}`, {
      trigger: { event: 'cart.abandoned' },
      steps: [
        { name: 'hold', wait: '2h' },
        { name: 'nudge', send: { title: 'Still there?' } },
      ],
    });

    await trackServer(keyBearer, anon, 'cart.abandoned');
    await eventually(async () => (await runEvents(keyBearer, anon)).some((e) => e.name === '$run.started'), {
      label: 'run started while anonymous',
      timeoutMs: 30_000,
      intervalMs: 300,
    });

    expect((await identify(clientBearer, { externalId: user, anonymousId: anon })).status).toBe(200);

    const events = await runEvents(keyBearer, user);
    expect(events.some((event) => event.name === '$run.started')).toBe(true);
    expect(events.some((event) => event.name === '$run.canceled')).toBe(false);
  });

  it('cancels a waiting run when the anonymous subscriber is absorbed into an existing one', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect((await identify(clientBearer, { externalId: user })).status).toBe(201);
    expect(await registerPush(clientBearer, anon, `tok_${uniq()}`)).toBe(201);
    await publish(keyBearer, `absorbed-${uniq()}`, {
      trigger: { event: 'cart.abandoned' },
      steps: [
        { name: 'hold', wait: '2h' },
        { name: 'nudge', send: { title: 'Still there?' } },
      ],
    });

    await trackServer(keyBearer, anon, 'cart.abandoned');
    await eventually(async () => (await runEvents(keyBearer, anon)).some((e) => e.name === '$run.started'), {
      label: 'run started while anonymous',
      timeoutMs: 30_000,
      intervalMs: 300,
    });

    expect((await identify(clientBearer, { externalId: user, anonymousId: anon })).status).toBe(200);

    const events = await runEvents(keyBearer, user);
    expect(events.some((event) => event.name === '$run.started')).toBe(true);
    const canceled = events.find((event) => event.name === '$run.canceled');
    expect(canceled?.data).toMatchObject({ reason: 'subscriber_merged' });
  });

  it('still delivers a send addressed to an id that is now only an alias', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();
    const user = `user_${uniq()}`;
    expect(await registerPush(clientBearer, anon, `tok_${uniq()}`)).toBe(201);
    expect((await identify(clientBearer, { externalId: user, anonymousId: anon })).status).toBe(200);

    const sent = await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ title: 'Old id', body: 'still routes', to: anon }),
    });
    expect(sent.status).toBe(202);

    await eventually(async () => (await deliveriesOf(keyBearer, user)) === 1, {
      label: 'the send addressed to the alias reached the identified subscriber',
      timeoutMs: 30_000,
      intervalMs: 300,
    });
  });

  it('ignores an anonymous id equal to the identified id', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = anonymousId();

    const identified = await identify(clientBearer, { externalId: anon, anonymousId: anon });
    expect(identified.status).toBe(201);

    const timeline = await timelineOf(keyBearer, anon);
    expect(timeline.filter((event) => event.name === '$subscriber.merged')).toHaveLength(0);
  });
});
