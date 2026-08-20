import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { generateP8 } from '../../utils/providerKeys';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Counts = {
  total: number;
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
  sent: 0,
  delivered: 0,
  bounced: 0,
  failed: 0,
  invalid: 0,
  ...overrides,
});

function token() {
  return `tok-${uniq()}${'d'.repeat(48)}`;
}

async function subscribe(
  headers: Record<string, string>,
  externalId: string,
  platform: 'ios' | 'android' = 'ios'
) {
  const { body } = await api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ externalId, channel: 'push', platform, token: token() }),
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

async function uploadSandboxApns(headers: Record<string, string>) {
  await api('/v1/credentials/apns', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p8: await generateP8(),
      teamId: 'ABCDE12345',
      keyId: 'XYZ9876543',
      bundleId: 'dev.buzzkit.phase4',
      environment: 'sandbox',
    }),
  });
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

  it('is idempotent per tenant on idempotencyKey and sets an expiry', async () => {
    const { keyBearer } = await setupWorkspace();
    const idempotencyKey = `idem-${uniq()}`;

    const first = await send(keyBearer, { to: 'user_1', idempotencyKey, ttlSeconds: 3600 });
    expect(first.status).toBe(202);
    expect(first.body.data?.id).toMatch(/^msg_/);
    const expiresIn = new Date(first.body.data?.expiresAt ?? 0).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(3500_000);
    expect(expiresIn).toBeLessThanOrEqual(3600_000);

    const replay = await send(keyBearer, { to: 'user_1', idempotencyKey });
    expect(replay.status).toBe(200);
    expect(replay.body.data?.id).toBe(first.body.data?.id);

    const otherTenant = await createTenant(keyBearer);
    const elsewhere = await send(
      { ...keyBearer, 'buzzkit-tenant': otherTenant.slug },
      { to: 'user_1', idempotencyKey }
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
        endpoint: token(),
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
      apns: { environment: 'sandbox' },
      data: { deepLink: 'app://x' },
    });

    const attempted = await waitFor(async () => {
      const [row] = await deliveries(keyBearer, sent.body.data?.id ?? '');
      return row && row.attempts >= 1 ? row : null;
    });

    expect(attempted.status).toBe('retrying');
    expect(['transport', 'timeout', 'provider_unavailable']).toContain(attempted.lastErrorCode);
    expect(new Date(attempted.nextAttemptAt ?? 0).getTime()).toBeGreaterThan(Date.now());
    expect(attempted.settledAt).toBeNull();

    const single = await api<DeliveryBody>(`/v1/deliveries/${attempted.id}`, { headers: keyBearer });
    expect(single.status).toBe(200);
    expect(single.body.data?.id).toBe(attempted.id);

    const attempts = await api<AttemptBody[]>(`/v1/deliveries/${attempted.id}/attempts`, {
      headers: keyBearer,
    });
    expect(attempts.body.data).toHaveLength(1);
    const [first] = attempts.body.data ?? [];
    expect(first?.attempt).toBe(1);
    expect(first?.outcome).toBe('retry');
    expect(first?.errorCode).toBe(attempted.lastErrorCode);
    expect(first?.request).toMatchObject({
      aps: { alert: { title: 'Hello', body: 'World' } },
      deepLink: 'app://x',
    });
    expect(JSON.stringify(first?.request)).not.toContain('PRIVATE KEY');
  });

  it('reconciliation re-drives due retries and expires overdue deliveries', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadSandboxApns(keyBearer);
    const user = `user_${uniq()}`;
    await subscribe(keyBearer, user);

    const sent = await send(keyBearer, { to: user, apns: { environment: 'sandbox' } });
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
    expect((await api('/v1/deliveries/nope!', { headers: keyBearer })).status).toBe(400);
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
