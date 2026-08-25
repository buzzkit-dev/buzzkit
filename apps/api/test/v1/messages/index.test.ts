import { and } from '@buzzkit/database';
import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { fakeToken, TRANSIENT_CODES, TRANSIENT_STATUS, uploadSandboxApns } from '../../utils/fixtures';
import { encodeMessageId } from '../../utils/ids';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Counts = {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  invalid: number;
};
type MessageBody = {
  id: string;
  status: string;
  topic: string | null;
  targets: Record<string, unknown>;
  counts: Counts;
  expiresAt: string;
};
type DeliveryBody = {
  id: string;
  subscriberId: string;
  subscriptionId: string;
  provider: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAttemptAt: string | null;
  lastAttemptedAt: string | null;
  settledAt: string | null;
};
type AttemptBody = {
  attempt: number;
  outcome: string;
  errorCode: string | null;
  providerReason: string | null;
  request: unknown;
  response: unknown;
  latencyMs: number | null;
};

const zeroCounts = (total: number, overrides: Partial<Counts> = {}): Counts => ({
  total,
  pending: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
  failed: 0,
  invalid: 0,
  ...overrides,
});

async function subscribe(
  headers: Record<string, string>,
  externalId: string,
  platform: 'ios' | 'android' = 'ios',
  environment: 'production' | 'sandbox' = 'sandbox'
) {
  const { body } = await api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ externalId, channel: 'push', platform, environment, token: fakeToken('d') }),
  });
  return body.data?.id ?? '';
}

async function send(headers: Record<string, string>, input: Record<string, unknown>) {
  return api<MessageBody>('/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Hello', body: 'World', ...input }),
  });
}

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('timed out waiting for condition');
}

async function awaitCompletion(headers: Record<string, string>, id: string) {
  return waitFor(async () => {
    const { body } = await api<MessageBody>(`/v1/messages/${id}`, { headers });
    return body.data?.status === 'completed' ? body.data : null;
  });
}

async function deliveries(headers: Record<string, string>, id: string, query = '') {
  const { body } = await api<{ items: DeliveryBody[] }>(`/v1/messages/${id}/deliveries${query}`, { headers });
  return body.data?.items ?? [];
}

async function deliveryRowIdFor(externalId: string): Promise<number> {
  const [row] = await db
    .select({ id: tables.delivery.id })
    .from(tables.delivery)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.delivery.subscriberId))
    .where(eq(tables.subscriber.externalId, externalId));
  return row!.id;
}

async function triggerReconciliation() {
  const response = await fetch(`${BASE_URL}/__scheduled?cron=*/5+*+*+*+*`);
  if (!response.ok) throw new Error(`scheduled trigger failed: ${response.status}`);
}

describe('POST /v1/messages — validation', () => {
  it('requires a target and some content, and rejects unknown topics, unsupported channels, bad ttl', async () => {
    const { keyBearer } = await setupWorkspace();

    expect((await send(keyBearer, {})).status).toBe(400);

    const noContent = await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ to: 'user_1' }),
    });
    expect(noContent.status).toBe(400);

    expect((await send(keyBearer, { topic: `nope-${uniq()}` })).status).toBe(404);
    expect((await send(keyBearer, { to: 'user_1', channel: 'email' })).status).toBe(400);
    expect((await send(keyBearer, { to: Array.from({ length: 1001 }, (_, i) => `u${i}`) })).status).toBe(400);
    expect((await send(keyBearer, { to: 'user_1', badge: -1 })).status).toBe(400);
    expect((await send(keyBearer, { to: 'user_1', ttlSeconds: 10 })).status).toBe(400);
  });

  it('caps the payload at 8KB', async () => {
    const { keyBearer } = await setupWorkspace();
    const tooBig = await send(keyBearer, { to: 'u', data: { blob: 'x'.repeat(9 * 1024) } });
    expect(tooBig.status).toBe(400);
    const fits = await send(keyBearer, { to: 'u', data: { blob: 'x'.repeat(4 * 1024) } });
    expect(fits.status).toBe(202);
  });

  it('refuses sends on a disabled channel', async () => {
    const { keyBearer } = await setupWorkspace();

    await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { channels: { push: { enabled: false } } } }),
    });

    const { status, body } = await send(keyBearer, { to: 'user_1' });
    expect(status).toBe(400);
    expect(body.error?.message).toContain('disabled');
  });

  it('is idempotent per tenant: replays return the original with 202 + Idempotent-Replayed, mismatches are 409', async () => {
    const { keyBearer } = await setupWorkspace();
    const idempotencyKey = `idem-${uniq()}`;

    const first = await send(keyBearer, { to: 'user_1', idempotencyKey, ttlSeconds: 3600 });
    expect(first.status).toBe(202);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    expect(first.body.data?.id).toMatch(/^msg_/);
    const expiresIn = new Date(first.body.data?.expiresAt ?? 0).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(3500_000);
    expect(expiresIn).toBeLessThanOrEqual(3600_000);

    const replay = await send(keyBearer, { to: 'user_1', idempotencyKey, ttlSeconds: 3600 });
    expect(replay.status).toBe(202);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.body.data?.id).toBe(first.body.data?.id);

    const viaHeader = await api<MessageBody>('/v1/messages', {
      method: 'POST',
      headers: { ...keyBearer, 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ title: 'Hello', body: 'World', to: 'user_1', ttlSeconds: 3600 }),
    });
    expect(viaHeader.status).toBe(202);
    expect(viaHeader.body.data?.id).toBe(first.body.data?.id);

    const mismatch = await send(keyBearer, { to: 'user_2', idempotencyKey, ttlSeconds: 3600 });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error?.code).toBe('idempotency_key_reused');
    expect(mismatch.body.error?.param).toBe('idempotencyKey');

    const otherTenant = await createTenant(keyBearer);
    const elsewhere = await send(
      { ...keyBearer, 'buzzkit-tenant': otherTenant.slug },
      { to: 'user_1', idempotencyKey, ttlSeconds: 3600 }
    );
    expect(elsewhere.status).toBe(202);
    expect(elsewhere.body.data?.id).not.toBe(first.body.data?.id);
  });

  it('requires messages:send — read-only keys cannot send but can read', async () => {
    const { owner, workspace } = await setupWorkspace();
    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const bearer = { Authorization: `Bearer ${readOnly.secret}` };

    expect((await send(bearer, { to: 'user_1' })).status).toBe(403);
    expect((await api('/v1/messages', { headers: bearer })).status).toBe(200);
  });
});

describe('fan-out and targeting', () => {
  it('targets every enabled, active push subscription of the named subscribers — and nothing else', async () => {
    const { keyBearer } = await setupWorkspace();
    const alice = `alice_${uniq()}`;
    const bob = `bob_${uniq()}`;

    const aliceIphone = await subscribe(keyBearer, alice, 'ios');
    const aliceAndroid = await subscribe(keyBearer, alice, 'android');
    const bobMuted = await subscribe(keyBearer, bob, 'ios');
    await api(`/v1/subscriptions/${bobMuted}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: alice, channel: 'email', address: `${alice}@acme.com` }),
    });
    await subscribe(keyBearer, `carol_${uniq()}`, 'ios');

    const sent = await send(keyBearer, { to: [alice, bob] });
    expect(sent.status).toBe(202);

    const completed = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');
    expect(completed.counts.total).toBe(2);

    const rows = await deliveries(keyBearer, sent.body.data?.id ?? '');
    expect(rows.map((d) => d.subscriptionId).sort()).toEqual([aliceIphone, aliceAndroid].sort());
    expect(rows.find((d) => d.subscriptionId === aliceIphone)?.provider).toBe('apns');
    expect(rows.find((d) => d.subscriptionId === aliceAndroid)?.provider).toBe('fcm');
  });

  it('topic sends honour per-subscriber preferences and topic defaults', async () => {
    const { keyBearer } = await setupWorkspace();
    const optIn = `optin-${uniq()}`;
    const optOut = `optout-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: optIn, name: 'On' }),
    });
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: optOut, name: 'Off', defaultOptedIn: false }),
    });

    const quiet = `quiet_${uniq()}`;
    const loud = `loud_${uniq()}`;
    const undecided = `undecided_${uniq()}`;
    await subscribe(keyBearer, quiet);
    const loudSub = await subscribe(keyBearer, loud);
    const undecidedSub = await subscribe(keyBearer, undecided);
    await api(`/v1/subscribers/${quiet}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [optIn]: false } }),
    });
    await api(`/v1/subscribers/${loud}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [optOut]: true } }),
    });

    const defaultOn = await send(keyBearer, { topic: optIn });
    expect((await awaitCompletion(keyBearer, defaultOn.body.data?.id ?? '')).counts.total).toBe(2);
    expect(
      (await deliveries(keyBearer, defaultOn.body.data?.id ?? '')).map((d) => d.subscriptionId).sort()
    ).toEqual([loudSub, undecidedSub].sort());

    const defaultOff = await send(keyBearer, { topic: optOut });
    expect((await awaitCompletion(keyBearer, defaultOff.body.data?.id ?? '')).counts.total).toBe(1);
    expect(
      (await deliveries(keyBearer, defaultOff.body.data?.id ?? '')).map((d) => d.subscriptionId)
    ).toEqual([loudSub]);
  });

  it('refuses a topic send on a channel the topic does not offer', async () => {
    const { keyBearer } = await setupWorkspace();
    const digest = `digest-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: digest, name: 'Weekly digest', channels: ['email'] }),
    });

    const refused = await send(keyBearer, { topic: digest });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe('channel_not_offered');
    expect(refused.body.error?.param).toBe('topic');
  });

  it('`to` combined with `topic` respects preferences for just those subscribers', async () => {
    const { keyBearer } = await setupWorkspace();
    const topic = `promo-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topic, name: 'Promo' }),
    });
    const yes = `yes_${uniq()}`;
    const no = `no_${uniq()}`;
    const yesSub = await subscribe(keyBearer, yes);
    await subscribe(keyBearer, no);
    await subscribe(keyBearer, `bystander_${uniq()}`);
    await api(`/v1/subscribers/${no}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [topic]: false } }),
    });

    const sent = await send(keyBearer, { to: [yes, no], topic });
    expect((await awaitCompletion(keyBearer, sent.body.data?.id ?? '')).counts.total).toBe(1);
    expect((await deliveries(keyBearer, sent.body.data?.id ?? '')).map((d) => d.subscriptionId)).toEqual([
      yesSub,
    ]);
  });

  it('completes with zero deliveries when nobody is reachable', async () => {
    const { keyBearer } = await setupWorkspace();

    const sent = await send(keyBearer, { to: `nobody_${uniq()}` });
    const done = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');

    expect(done.counts).toEqual(zeroCounts(0));
    expect(await deliveries(keyBearer, sent.body.data?.id ?? '')).toHaveLength(0);
  });

  it('fans out large audiences across self-chaining pages', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenantSlug = (await createTenant(keyBearer)).slug;
    const headers = { ...keyBearer, 'buzzkit-tenant': tenantSlug };
    const [tenant] = await db
      .select({ id: tables.tenant.id })
      .from(tables.tenant)
      .where(eq(tables.tenant.slug, tenantSlug));
    const audience = 620;

    const subscribers = await db
      .insert(tables.subscriber)
      .values(
        Array.from({ length: audience }, (_, i) => ({
          tenantId: tenant!.id,
          externalId: `bulk_${uniq()}_${i}`,
        }))
      )
      .returning({ id: tables.subscriber.id });
    await db.insert(tables.subscription).values(
      subscribers.map((row) => ({
        tenantId: tenant!.id,
        subscriberId: row.id,
        channel: 'push' as const,
        platform: 'ios' as const,
        endpoint: fakeToken('d'),
      }))
    );
    const topic = `bulk-${uniq()}`;
    await api('/v1/topics', { method: 'POST', headers, body: JSON.stringify({ slug: topic, name: 'Bulk' }) });

    const sent = await send(headers, { topic });
    const done = await awaitCompletion(headers, sent.body.data?.id ?? '');

    expect(done.counts).toEqual(zeroCounts(audience, { failed: audience }));
  });
});

describe('delivery outcomes and the attempt ledger', () => {
  it('fails immediately with no_credential and still records the reason', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const sent = await send(keyBearer, { to: user });
    const done = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');

    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));
    const [row] = await deliveries(keyBearer, sent.body.data?.id ?? '');
    expect(row?.status).toBe('failed');
    expect(row?.lastErrorCode).toBe('no_credential');
    expect(row?.settledAt).toBeTruthy();
  });

  it('records every provider attempt with request, classification, and a scheduled retry', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const sent = await send(keyBearer, {
      to: user,
      data: { deepLink: 'app://x' },
    });

    const attempted = await waitFor(async () => {
      const [row] = await deliveries(keyBearer, sent.body.data?.id ?? '');
      return row && row.attempts >= 1 ? row : null;
    });

    expect(attempted.status).toBe(TRANSIENT_STATUS);
    expect(TRANSIENT_CODES).toContain(attempted.lastErrorCode);
    const scheduledIn =
      new Date(attempted.nextAttemptAt ?? 0).getTime() - new Date(attempted.lastAttemptedAt ?? 0).getTime();
    const scheduleCeiling = attempted.lastErrorCode === 'timeout' ? 72_000 : 6_000;
    expect(scheduledIn).toBeGreaterThanOrEqual(4_000);
    expect(scheduledIn).toBeLessThanOrEqual(scheduleCeiling + 15_000);
    expect(attempted.settledAt).toBeNull();

    const single = await api<DeliveryBody>(`/v1/deliveries/${attempted.id}`, { headers: keyBearer });
    expect(single.status).toBe(200);
    expect(single.body.data?.id).toBe(attempted.id);

    const attempts = await api<{ items: AttemptBody[] }>(`/v1/deliveries/${attempted.id}/attempts`, {
      headers: keyBearer,
    });
    expect(attempts.body.data?.items).toHaveLength(1);
    const [first] = attempts.body.data?.items ?? [];
    expect(first?.attempt).toBe(1);
    expect(first?.outcome).toBe('retry');
    expect(first?.errorCode).toBe(attempted.lastErrorCode);
    expect(first?.request).toMatchObject({
      aps: { alert: { title: 'Hello', body: 'World' } },
      deepLink: 'app://x',
    });
    expect(JSON.stringify(first?.request)).not.toContain('PRIVATE KEY');
  });

  it('heals a message whose counters drifted: completion is derived and counts are recounted', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const sent = await send(keyBearer, { to: user });
    const messageId = sent.body.data?.id ?? '';
    const done = await awaitCompletion(keyBearer, messageId);
    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));

    const [owning] = await db
      .select({ messageId: tables.delivery.messageId })
      .from(tables.delivery)
      .where(eq(tables.delivery.id, await deliveryRowIdFor(user)));
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(tables.message)
      .set({ status: 'processing', total: 0, failed: 0, completedAt: null, updatedAt: stale })
      .where(eq(tables.message.id, owning!.messageId));

    const drifted = await api<MessageBody>(`/v1/messages/${messageId}`, { headers: keyBearer });
    expect(drifted.body.data?.status).toBe('processing');

    await triggerReconciliation();

    const healed = await waitFor(async () => {
      const { body } = await api<MessageBody>(`/v1/messages/${messageId}`, { headers: keyBearer });
      return body.data?.status === 'completed' ? body.data : null;
    });
    expect(healed.counts).toEqual(zeroCounts(1, { failed: 1 }));
  });

  it('reconciliation re-drives due retries and expires overdue deliveries', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const sent = await send(keyBearer, { to: user });
    const messageId = sent.body.data?.id ?? '';
    await waitFor(async () => {
      const [row] = await deliveries(keyBearer, messageId);
      return row?.status === 'retrying' ? row : null;
    });

    const retryingId = await deliveryRowIdFor(user);
    await db
      .update(tables.delivery)
      .set({ nextAttemptAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(tables.delivery.id, retryingId));

    await triggerReconciliation();

    const retried = await waitFor(async () => {
      const [row] = await deliveries(keyBearer, messageId);
      return row && row.attempts >= 2 ? row : null;
    });
    expect(retried.attempts).toBeGreaterThanOrEqual(2);

    const [owning] = await db
      .select({ messageId: tables.delivery.messageId })
      .from(tables.delivery)
      .where(eq(tables.delivery.id, retryingId));
    await db
      .update(tables.message)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tables.message.id, owning!.messageId));

    await triggerReconciliation();

    const expired = await waitFor(async () => {
      const { body } = await api<MessageBody>(`/v1/messages/${messageId}`, { headers: keyBearer });
      return body.data?.status === 'completed' ? body.data : null;
    });
    expect(expired.counts.failed).toBe(1);
    const [finalRow] = await deliveries(keyBearer, messageId);
    expect(finalRow?.status).toBe('failed');
    expect(finalRow?.lastErrorCode).toBe('expired');
  });
});

describe('GET /v1/messages, deliveries', () => {
  it('lists newest-first with cursors, filters deliveries by status, isolates tenants, and audits', async () => {
    const { keyBearer, ownerBearer, workspace } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const a = await send(keyBearer, { to: user });
    const b = await send(keyBearer, { to: 'u2' });
    await send({ ...keyBearer, 'buzzkit-tenant': other.slug }, { to: 'u3' });
    await awaitCompletion(keyBearer, a.body.data?.id ?? '');

    const page1 = await api<{ items: MessageBody[]; hasMore: boolean; nextCursor: string }>(
      '/v1/messages?limit=1',
      {
        headers: keyBearer,
      }
    );
    expect(page1.body.data?.items[0]?.id).toBe(b.body.data?.id);
    expect(page1.body.data?.hasMore).toBe(true);

    const page2 = await api<{ items: MessageBody[]; hasMore: boolean }>(
      `/v1/messages?limit=1&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items[0]?.id).toBe(a.body.data?.id);

    expect((await deliveries(keyBearer, a.body.data?.id ?? '', '?status=failed')).length).toBe(1);
    expect((await deliveries(keyBearer, a.body.data?.id ?? '', '?status=sent')).length).toBe(0);
    const badStatus = await api(`/v1/messages/${a.body.data?.id}/deliveries?status=bogus`, {
      headers: keyBearer,
    });
    expect(badStatus.status).toBe(400);

    const [row] = await deliveries(keyBearer, a.body.data?.id ?? '');
    const crossTenantDelivery = await api(`/v1/deliveries/${row?.id}`, {
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(crossTenantDelivery.status).toBe(404);
    expect((await api('/v1/deliveries/nope!', { headers: keyBearer })).status).toBe(404);
    expect(
      (
        await api(`/v1/messages/${a.body.data?.id}`, {
          headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
        })
      ).status
    ).toBe(404);

    const events = await api<{ items: Array<{ event: string; actorType: string }> }>(
      `/v1/workspaces/${workspace.slug}/events`,
      { headers: ownerBearer }
    );
    const names = events.body.data?.items.map((i) => i.event) ?? [];
    expect(names.filter((n) => n === 'message.created')).toHaveLength(3);
    expect(events.body.data?.items.find((i) => i.event === 'message.completed')?.actorType).toBe('system');
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function subscriptionFor(externalId: string) {
  const [row] = await db
    .select({
      tenantId: tables.subscription.tenantId,
      subscriberId: tables.subscription.subscriberId,
      subscriptionId: tables.subscription.id,
    })
    .from(tables.subscription)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscription.subscriberId))
    .where(eq(tables.subscriber.externalId, externalId));
  return row!;
}

async function seedMessage(
  tenantId: number,
  to: string[],
  overrides: Partial<typeof tables.message.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(tables.message)
    .values({
      tenantId,
      channel: 'push',
      targets: { to },
      payload: { title: 'Seed', body: 'seed' },
      status: 'processing',
      total: to.length,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      fanoutCompletedAt: new Date(),
      ...overrides,
    })
    .returning({ id: tables.message.id });
  return row!.id;
}

async function seedDelivery(
  messageId: number,
  externalId: string,
  overrides: Partial<typeof tables.delivery.$inferInsert> = {}
): Promise<number> {
  const target = await subscriptionFor(externalId);
  const [row] = await db
    .insert(tables.delivery)
    .values({
      tenantId: target.tenantId,
      messageId,
      subscriberId: target.subscriberId,
      subscriptionId: target.subscriptionId,
      channel: 'push',
      provider: 'apns',
      status: 'pending',
      ...overrides,
    })
    .returning({ id: tables.delivery.id });
  return row!.id;
}

async function deliveryRow(id: number) {
  const [row] = await db.select().from(tables.delivery).where(eq(tables.delivery.id, id));
  return row!;
}

async function messageRow(id: number) {
  const [row] = await db.select().from(tables.message).where(eq(tables.message.id, id));
  return row!;
}

async function attemptsOf(deliveryId: number) {
  return db
    .select({ attempt: tables.deliveryAttempt.attempt, outcome: tables.deliveryAttempt.outcome })
    .from(tables.deliveryAttempt)
    .where(eq(tables.deliveryAttempt.deliveryId, deliveryId));
}

describe('scheduling, queueing and retries', () => {
  it('concurrent sends with one idempotency key create exactly one message', async () => {
    const { keyBearer } = await setupWorkspace();
    const idempotencyKey = `race-${uniq()}`;

    const to = `u_${uniq()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => send(keyBearer, { to, idempotencyKey }))
    );
    const ids = new Set(results.map((r) => r.body.data?.id));
    expect(ids.size).toBe(1);
    expect(results.every((r) => r.status === 202)).toBe(true);
    expect(results.filter((r) => r.headers.get('idempotent-replayed') === 'true')).toHaveLength(4);
  });

  it('deduplicates `to` and skips invalid or deleted subscriptions', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    const dead = `dead_${uniq()}`;
    await subscribe(keyBearer, user);
    const deadSub = await subscribe(keyBearer, dead);
    await api(`/v1/subscriptions/${deadSub}`, { method: 'DELETE', headers: keyBearer });
    const invalid = `invalid_${uniq()}`;
    await subscribe(keyBearer, invalid);
    const target = await subscriptionFor(invalid);
    await db
      .update(tables.subscription)
      .set({ status: 'invalid' })
      .where(eq(tables.subscription.id, target.subscriptionId));

    const sent = await send(keyBearer, { to: [user, user, dead, invalid] });
    const done = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');
    expect(done.counts.total).toBe(1);
  });

  it('routes each platform to its provider and only fails the one without a credential', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    const ios = await subscribe(keyBearer, user, 'ios');
    const android = await subscribe(keyBearer, user, 'android');

    const sent = await send(keyBearer, { to: user });
    const messageId = sent.body.data?.id ?? '';
    const rows = await waitFor(async () => {
      const list = await deliveries(keyBearer, messageId);
      return list.length === 2 && list.every((d) => d.attempts >= 1 || d.status === 'failed') ? list : null;
    });

    const iosRow = rows.find((d) => d.subscriptionId === ios)!;
    const androidRow = rows.find((d) => d.subscriptionId === android)!;
    expect(androidRow.status).toBe('failed');
    expect(androidRow.lastErrorCode).toBe('no_credential');
    expect(iosRow.status).toBe(TRANSIENT_STATUS);

    const { body } = await api<MessageBody>(`/v1/messages/${messageId}`, { headers: keyBearer });
    expect(body.data?.status).toBe('processing');
    expect(body.data?.counts).toMatchObject({ total: 2, pending: 1, failed: 1, sent: 0 });
  });

  it('re-drives a due retry exactly once — never inside the grace period, never twice under duplicate sweeps', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const messageId = await seedMessage(tenantId, [user]);
    const deliveryId = await seedDelivery(messageId, user, {
      status: 'retrying',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 30_000),
      firstAttemptedAt: new Date(Date.now() - 40_000),
      lastAttemptedAt: new Date(Date.now() - 40_000),
    });

    await triggerReconciliation();
    await sleep(2_000);
    expect((await deliveryRow(deliveryId)).attempts).toBe(1);

    await db
      .update(tables.delivery)
      .set({ nextAttemptAt: new Date(Date.now() - 120_000) })
      .where(eq(tables.delivery.id, deliveryId));
    await Promise.all([triggerReconciliation(), triggerReconciliation(), triggerReconciliation()]);

    await waitFor(async () => {
      const row = await deliveryRow(deliveryId);
      return row.attempts >= 2 ? row : null;
    });
    await sleep(2_000);

    const settled = await deliveryRow(deliveryId);
    expect(settled.attempts).toBe(2);
    expect(settled.status).toBe(TRANSIENT_STATUS);
    expect(settled.leaseExpiresAt).toBeNull();
    expect(settled.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await attemptsOf(deliveryId)).map((a) => a.attempt)).toEqual([2]);
  });

  it('exhausts retries at the attempt cap: terminal failed, settled, message completed with exact counts', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const messageId = await seedMessage(tenantId, [user], { total: 0 });
    const deliveryId = await seedDelivery(messageId, user, {
      status: 'retrying',
      attempts: 7,
      nextAttemptAt: new Date(Date.now() - 120_000),
    });

    await triggerReconciliation();

    const failed = await waitFor(async () => {
      const row = await deliveryRow(deliveryId);
      return row.status === 'failed' ? row : null;
    });
    expect(failed.attempts).toBe(8);
    expect(failed.settledAt).not.toBeNull();
    expect(failed.nextAttemptAt).toBeNull();
    expect(TRANSIENT_CODES).toContain(failed.lastErrorCode);
    expect((await attemptsOf(deliveryId)).map((a) => a.outcome)).toEqual(['failed']);

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));
  });

  it('re-drives deliveries whose enqueue was lost and deliveries whose worker died mid-attempt', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const lost = `lost_${uniq()}`;
    const crashed = `crashed_${uniq()}`;
    await subscribe(keyBearer, lost);
    await subscribe(keyBearer, crashed);
    const { tenantId } = await subscriptionFor(lost);
    const messageId = await seedMessage(tenantId, [lost, crashed]);
    const lostId = await seedDelivery(messageId, lost, {
      status: 'pending',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    const crashedId = await seedDelivery(messageId, crashed, {
      status: 'retrying',
      attempts: 2,
      nextAttemptAt: null,
      leaseExpiresAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    const fresh = `fresh_${uniq()}`;
    await subscribe(keyBearer, fresh);
    const freshId = await seedDelivery(messageId, fresh, { status: 'pending' });

    await triggerReconciliation();

    const lostRow = await waitFor(async () => {
      const row = await deliveryRow(lostId);
      return row.attempts >= 1 ? row : null;
    });
    const crashedRow = await waitFor(async () => {
      const row = await deliveryRow(crashedId);
      return row.attempts >= 3 ? row : null;
    });
    expect(lostRow.status).toBe(TRANSIENT_STATUS);
    expect(crashedRow.status).toBe(TRANSIENT_STATUS);
    expect(crashedRow.leaseExpiresAt).toBeNull();
    await sleep(1_000);
    expect((await deliveryRow(freshId)).attempts).toBe(0);
  });

  it('resumes a stalled fan-out from its cursor', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const stale = new Date(Date.now() - 11 * 60 * 1000);
    const messageId = await seedMessage(tenantId, [user], {
      total: 0,
      fanoutCompletedAt: null,
      fanoutCursor: 0,
      createdAt: stale,
      updatedAt: stale,
    });

    await triggerReconciliation();

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));
    expect((await messageRow(messageId)).fanoutCompletedAt).not.toBeNull();
  });

  it('expiry only touches unsettled deliveries; sent ones keep their state and count', async () => {
    const { keyBearer } = await setupWorkspace();
    const sentUser = `sent_${uniq()}`;
    const stuckUser = `stuck_${uniq()}`;
    await subscribe(keyBearer, sentUser);
    await subscribe(keyBearer, stuckUser);
    const { tenantId } = await subscriptionFor(sentUser);
    const messageId = await seedMessage(tenantId, [sentUser, stuckUser], {
      expiresAt: new Date(Date.now() - 1_000),
      total: 2,
      sent: 1,
    });
    const sentId = await seedDelivery(messageId, sentUser, {
      status: 'sent',
      attempts: 1,
      sentAt: new Date(),
      settledAt: new Date(),
    });
    const stuckId = await seedDelivery(messageId, stuckUser, {
      status: 'retrying',
      attempts: 3,
      nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await triggerReconciliation();

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(2, { sent: 1, failed: 1 }));
    expect((await deliveryRow(sentId)).status).toBe('sent');
    const stuck = await deliveryRow(stuckId);
    expect(stuck.status).toBe('failed');
    expect(stuck.lastErrorCode).toBe('expired');
    expect(stuck.settledAt).not.toBeNull();
  });

  it('never completes a message while a delivery is still in flight, even if it looks stalled', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const stale = new Date(Date.now() - 11 * 60 * 1000);
    const messageId = await seedMessage(tenantId, [user], { updatedAt: stale });
    await seedDelivery(messageId, user, {
      status: 'retrying',
      attempts: 2,
      nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await triggerReconciliation();
    await sleep(1_500);

    const { body } = await api<MessageBody>(`/v1/messages/${encodeMessageId(messageId)}`, {
      headers: keyBearer,
    });
    expect(body.data?.status).toBe('processing');
    expect(body.data?.counts.pending).toBe(1);
    expect(
      await db
        .select({ id: tables.delivery.id })
        .from(tables.delivery)
        .where(and(eq(tables.delivery.messageId, messageId), eq(tables.delivery.status, 'retrying')))
    ).toHaveLength(1);
  });
});

describe('attempt-time guards and sweep bounds', () => {
  it('respects an active lease: a duplicate job for a claimed attempt is skipped', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const messageId = await seedMessage(tenantId, [user]);
    const deliveryId = await seedDelivery(messageId, user, {
      status: 'retrying',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 120_000),
      leaseExpiresAt: new Date(Date.now() + 30_000),
    });

    await triggerReconciliation();
    await sleep(2_000);

    const row = await deliveryRow(deliveryId);
    expect(row.attempts).toBe(1);
    expect(await attemptsOf(deliveryId)).toHaveLength(0);
    expect(row.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails a delivery as unsubscribed when the subscription was muted or removed after fan-out, without calling the provider', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const muted = `muted_${uniq()}`;
    const removed = `removed_${uniq()}`;
    const mutedSub = await subscribe(keyBearer, muted);
    const removedSub = await subscribe(keyBearer, removed);
    const { tenantId } = await subscriptionFor(muted);
    const messageId = await seedMessage(tenantId, [muted, removed]);
    const mutedId = await seedDelivery(messageId, muted, {
      status: 'retrying',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 120_000),
    });
    const removedId = await seedDelivery(messageId, removed, {
      status: 'retrying',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 120_000),
    });
    await api(`/v1/subscriptions/${mutedSub}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    await api(`/v1/subscriptions/${removedSub}`, { method: 'DELETE', headers: keyBearer });

    await triggerReconciliation();

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(2, { failed: 2 }));
    for (const id of [mutedId, removedId]) {
      const row = await deliveryRow(id);
      expect(row.status).toBe('failed');
      expect(row.lastErrorCode).toBe('unsubscribed');
      expect(row.attempts).toBe(1);
      expect(await attemptsOf(id)).toHaveLength(0);
    }
  });

  it('duplicate fan-out jobs for the same page create one set of deliveries and exact counts', async () => {
    const { keyBearer } = await setupWorkspace();
    const users = [`a_${uniq()}`, `b_${uniq()}`, `c_${uniq()}`];
    for (const user of users) await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(users[0]!);
    const stale = new Date(Date.now() - 11 * 60 * 1000);
    const messageId = await seedMessage(tenantId, users, {
      total: 0,
      fanoutCompletedAt: null,
      createdAt: stale,
      updatedAt: stale,
    });

    await Promise.all([triggerReconciliation(), triggerReconciliation(), triggerReconciliation()]);

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(3, { failed: 3 }));
    expect(await deliveries(keyBearer, encodeMessageId(messageId))).toHaveLength(3);
  });

  it('completes with zero deliveries when the topic vanished before fan-out', async () => {
    const { keyBearer } = await setupWorkspace();
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const stale = new Date(Date.now() - 11 * 60 * 1000);
    const messageId = await seedMessage(tenantId, [], {
      targets: { topic: 'ghost' },
      topic: 'ghost',
      total: 0,
      fanoutCompletedAt: null,
      createdAt: stale,
      updatedAt: stale,
    });

    await triggerReconciliation();

    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(0));
  });

  it('sweeps are bounded: a backlog larger than one sweep drains across runs without loss', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenantSlug = (await createTenant(keyBearer)).slug;
    const [tenant] = await db
      .select({ id: tables.tenant.id })
      .from(tables.tenant)
      .where(eq(tables.tenant.slug, tenantSlug));
    const backlog = 1100;
    const subscribers = await db
      .insert(tables.subscriber)
      .values(
        Array.from({ length: backlog }, (_, i) => ({
          tenantId: tenant!.id,
          externalId: `sweep_${uniq()}_${i}`,
        }))
      )
      .returning({ id: tables.subscriber.id });
    const subscriptions = await db
      .insert(tables.subscription)
      .values(
        subscribers.map((row) => ({
          tenantId: tenant!.id,
          subscriberId: row.id,
          channel: 'push' as const,
          platform: 'ios' as const,
          endpoint: fakeToken('d'),
        }))
      )
      .returning({ id: tables.subscription.id, subscriberId: tables.subscription.subscriberId });
    const messageId = await seedMessage(tenant!.id, [], { total: backlog });
    const stale = new Date(Date.now() - 11 * 60 * 1000);
    await db.insert(tables.delivery).values(
      subscriptions.map((row) => ({
        tenantId: tenant!.id,
        messageId,
        subscriberId: row.subscriberId,
        subscriptionId: row.id,
        channel: 'push' as const,
        provider: 'apns',
        status: 'pending' as const,
        createdAt: stale,
      }))
    );
    const settledCount = async () =>
      (
        await db
          .select({ id: tables.delivery.id })
          .from(tables.delivery)
          .where(and(eq(tables.delivery.messageId, messageId), eq(tables.delivery.status, 'failed')))
      ).length;

    await triggerReconciliation();
    await waitFor(async () => ((await settledCount()) >= 1000 ? true : null), 60_000);
    await sleep(2_000);
    expect(await settledCount()).toBe(1000);

    await triggerReconciliation();
    await waitFor(async () => ((await settledCount()) >= backlog ? true : null), 60_000);
    const done = await awaitCompletion(
      { ...keyBearer, 'buzzkit-tenant': tenantSlug },
      encodeMessageId(messageId)
    );
    expect(done.counts).toEqual(zeroCounts(backlog, { failed: backlog }));
  });
});

describe('isolation, pagination, and delivery-time credential state', () => {
  it('deliveries, attempts, and messages are invisible across tenants and 404 on malformed ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const sent = await send(keyBearer, { to: user });
    const messageId = sent.body.data?.id ?? '';
    await awaitCompletion(keyBearer, messageId);
    const [row] = await deliveries(keyBearer, messageId);
    const foreign = { ...keyBearer, 'buzzkit-tenant': other.slug };

    expect((await api(`/v1/messages/${messageId}/deliveries`, { headers: foreign })).status).toBe(404);
    expect((await api(`/v1/deliveries/${row?.id}/attempts`, { headers: foreign })).status).toBe(404);
    expect((await api('/v1/messages/nope!', { headers: keyBearer })).status).toBe(404);
    expect((await api('/v1/deliveries/nope!/attempts', { headers: keyBearer })).status).toBe(404);
  });

  it('validates list parameters and pages deliveries with opaque cursors', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    expect((await api('/v1/messages?cursor=nope!', { headers: keyBearer })).status).toBe(400);
    expect((await api('/v1/messages?limit=0', { headers: keyBearer })).status).toBe(400);
    expect((await api(`/v1/messages?cursor=${other.id}`, { headers: keyBearer })).status).toBe(400);

    const users = [`a_${uniq()}`, `b_${uniq()}`, `c_${uniq()}`];
    for (const user of users) await subscribe(keyBearer, user);
    const sent = await send(keyBearer, { to: users });
    const messageId = sent.body.data?.id ?? '';
    await awaitCompletion(keyBearer, messageId);

    const page1 = await api<{ items: DeliveryBody[]; hasMore: boolean; nextCursor: string | null }>(
      `/v1/messages/${messageId}/deliveries?limit=2`,
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.hasMore).toBe(true);
    expect(page1.body.data?.nextCursor).toMatch(/^dlv_/);
    const page2 = await api<{ items: DeliveryBody[]; hasMore: boolean }>(
      `/v1/messages/${messageId}/deliveries?limit=2&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items).toHaveLength(1);
    expect(page2.body.data?.hasMore).toBe(false);
    const ids = [...(page1.body.data?.items ?? []), ...(page2.body.data?.items ?? [])].map((d) => d.id);
    expect(new Set(ids).size).toBe(3);

    const elsewhere = await send({ ...keyBearer, 'buzzkit-tenant': other.slug }, { to: 'x' });
    const mine = await api<{ items: MessageBody[] }>('/v1/messages?limit=100', { headers: keyBearer });
    expect(mine.body.data?.items.some((m) => m.id === elsewhere.body.data?.id)).toBe(false);
  });

  it('a credential revoked between fan-out and delivery fails the attempt as no_credential with an empty request', async () => {
    const { keyBearer } = await setupWorkspace();
    const credential = await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);
    const { tenantId } = await subscriptionFor(user);
    const messageId = await seedMessage(tenantId, [user]);
    const deliveryId = await seedDelivery(messageId, user, {
      status: 'pending',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    await api(`/v1/credentials/${credential.id}`, { method: 'DELETE', headers: keyBearer });

    await triggerReconciliation();

    const failed = await waitFor(async () => {
      const row = await deliveryRow(deliveryId);
      return row.status === 'failed' ? row : null;
    });
    expect(failed.lastErrorCode).toBe('no_credential');
    const ledger = await db
      .select({ outcome: tables.deliveryAttempt.outcome, request: tables.deliveryAttempt.request })
      .from(tables.deliveryAttempt)
      .where(eq(tables.deliveryAttempt.deliveryId, deliveryId));
    expect(ledger).toEqual([{ outcome: 'failed', request: null }]);
    const done = await awaitCompletion(keyBearer, encodeMessageId(messageId));
    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));
  });

  it('a device registered for production never uses a sandbox key — the delivery fails as no_credential naming the environment', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user, 'ios', 'production');

    const sent = await send(keyBearer, { to: user });
    const done = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');
    expect(done.counts).toEqual(zeroCounts(1, { failed: 1 }));
    const [row] = await deliveries(keyBearer, sent.body.data?.id ?? '');
    expect(row?.lastErrorCode).toBe('no_credential');
    expect(row?.lastErrorMessage).toContain('production');
  });

  it('fan-out honours per-channel topic defaults', async () => {
    const { keyBearer } = await setupWorkspace();
    const topic = `quiet-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug: topic,
        name: 'Quiet',
        defaultOptedIn: true,
        channelDefaults: { push: false },
      }),
    });
    const undecided = `undecided_${uniq()}`;
    const explicit = `explicit_${uniq()}`;
    await subscribe(keyBearer, undecided);
    const explicitSub = await subscribe(keyBearer, explicit);
    await api(`/v1/subscribers/${explicit}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [topic]: { push: true } } }),
    });

    const sent = await send(keyBearer, { topic });
    const done = await awaitCompletion(keyBearer, sent.body.data?.id ?? '');
    expect(done.counts.total).toBe(1);
    expect((await deliveries(keyBearer, sent.body.data?.id ?? '')).map((d) => d.subscriptionId)).toEqual([
      explicitSub,
    ]);
  });
});
