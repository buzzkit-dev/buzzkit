import { toHex } from '@buzzkit/api/libs/encoding';
import { signWebhook } from 'buzzkit/webhooks';
import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, sql } from '../../utils/db';
import { setupWorkspace, uniq } from '../../utils/setup';

type SourceBody = {
  id: string;
  name: string;
  provider: 'stripe' | 'superwall' | 'custom';
  status: 'unverified' | 'active' | 'paused';
  url: string;
  verification: unknown;
  mapping: Record<string, unknown>;
  hasSecret: boolean;
  lastDeliveryAt: string | null;
};
type DeliveryBody = {
  id: string;
  outcome: string;
  reason: string | null;
  detail: string | null;
  providerEventId: string | null;
  providerType: string | null;
  subscriberId: string | null;
  event: string | null;
  eventId: string | null;
  payload: unknown;
};
type Ingested = { outcome: string; reason: string | null };
type Listed = {
  items: Array<{ name: string; source: string; data: Record<string, unknown>; timestamp: string }>;
};

async function stripeSignature(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${toHex(digest)}`;
}

function stripeEvent(id: string, customer: string, type = 'invoice.paid', livemode = true) {
  return {
    id,
    object: 'event',
    type,
    livemode,
    created: Math.floor(Date.now() / 1000) - 60,
    data: {
      object: { customer, status: 'active', currency: 'usd', plan: { nickname: 'Pro', amount: 1200 } },
    },
  };
}

async function createSource(headers: Record<string, string>, body: Record<string, unknown>) {
  return api<SourceBody>('/v1/sources', { method: 'POST', headers, body: JSON.stringify(body) });
}

async function ingest(url: string, body: string, headers: Record<string, string> = {}) {
  return api<Ingested>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

async function identify(headers: Record<string, string>, externalId: string, attributes: object = {}) {
  return api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ attributes }),
  });
}

describe('/v1/sources', () => {
  it('creates a source from a preset, activates it with a secret and never returns the secret', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const draft = await createSource(keyBearer, { name: 'Stripe', provider: 'stripe' });
    expect(draft.status).toBe(201);
    expect(draft.body.data).toMatchObject({
      name: 'Stripe',
      provider: 'stripe',
      status: 'unverified',
      hasSecret: false,
    });
    expect(draft.body.data?.id).toMatch(/^src_/);
    expect(draft.body.data?.url).toBe(`/v1/sources/${draft.body.data?.id}/ingest`);
    expect(draft.body.data?.mapping).toMatchObject({
      type: 'type',
      subscriber: { attribute: 'stripeCustomerId' },
    });

    const cannotActivate = await api(`/v1/sources/${draft.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ status: 'active' }),
    });
    expect(cannotActivate.status).toBe(400);
    expect(cannotActivate.body.error?.code).toBe('source_unverified');

    const activated = await api<SourceBody>(`/v1/sources/${draft.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ secret: 'whsec_test_secret' }),
    });
    expect(activated.status).toBe(200);
    expect(activated.body.data).toMatchObject({ status: 'active', hasSecret: true });
    expect(JSON.stringify(activated.body)).not.toContain('whsec_test_secret');

    const rows = await db.execute(
      sql`select secret_ciphertext from source where name = 'Stripe' and deleted_at is null`
    );
    expect(JSON.stringify(rows)).not.toContain('whsec_test_secret');

    const list = await api<{ items: SourceBody[] }>('/v1/sources', { headers: keyBearer });
    expect(list.body.data?.items.map((item) => item.name)).toEqual(['Stripe']);

    const badMapping = await createSource(keyBearer, {
      name: 'Broken',
      provider: 'custom',
      mapping: { type: 'type', subscriber: 'userId', events: {} },
    });
    expect(badMapping.status).toBe(400);
    expect(badMapping.body.error?.code).toBe('invalid_mapping');

    const removed = await api<SourceBody & { deleted: boolean }>(`/v1/sources/${draft.body.data?.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.data?.deleted).toBe(true);
    const gone = await api(`/v1/sources/${draft.body.data?.id}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('turns a signed Stripe delivery into a subscriber event, replays as a duplicate and rejects bad signatures', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;
    const customer = `cus_${uniq()}`;
    await identify(keyBearer, externalId, { stripeCustomerId: customer });
    const secret = `whsec_${uniq()}`;
    const created = await createSource(keyBearer, { name: 'Stripe', provider: 'stripe', secret });
    expect(created.body.data?.status).toBe('active');
    const url = created.body.data!.url;

    const body = JSON.stringify(stripeEvent(`evt_${uniq()}`, customer));
    const accepted = await ingest(url, body, { 'stripe-signature': await stripeSignature(secret, body) });
    expect(accepted.body, JSON.stringify(accepted.body)).toMatchObject({ data: { outcome: 'event' } });

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    const event = timeline.body.data?.items.find((item) => item.name === 'payment.succeeded');
    expect(event).toBeDefined();
    expect(event?.source).toBe('webhook');
    expect(event?.data).toMatchObject({
      status: 'active',
      plan: 'Pro',
      amount: 1200,
      currency: 'usd',
      $provider: 'stripe',
    });
    expect(Date.now() - Date.parse(event!.timestamp)).toBeGreaterThan(50_000);

    const replay = await ingest(url, body, { 'stripe-signature': await stripeSignature(secret, body) });
    expect(replay.body.data?.outcome).toBe('duplicate');
    const again = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(again.body.data?.items.filter((item) => item.name === 'payment.succeeded')).toHaveLength(1);

    const forged = await ingest(url, body, {
      'stripe-signature': await stripeSignature('whsec_other', body),
    });
    expect(forged.status).toBe(401);
    expect(forged.body.data?.outcome).toBe('rejected');
    const unsigned = await ingest(url, body);
    expect(unsigned.status).toBe(401);

    const unknownCustomer = JSON.stringify(stripeEvent(`evt_${uniq()}`, 'cus_nobody'));
    const orphan = await ingest(url, unknownCustomer, {
      'stripe-signature': await stripeSignature(secret, unknownCustomer),
    });
    expect(orphan.body.data).toEqual({ outcome: 'dropped', reason: 'no_subscriber' });

    const testMode = JSON.stringify(stripeEvent(`evt_${uniq()}`, customer, 'invoice.paid', false));
    const filtered = await ingest(url, testMode, {
      'stripe-signature': await stripeSignature(secret, testMode),
    });
    expect(filtered.body.data).toEqual({ outcome: 'dropped', reason: 'filtered' });

    const unlisted = JSON.stringify(stripeEvent(`evt_${uniq()}`, customer, 'charge.refunded'));
    const ignored = await ingest(url, unlisted, {
      'stripe-signature': await stripeSignature(secret, unlisted),
    });
    expect(ignored.body.data).toEqual({ outcome: 'dropped', reason: 'unlisted_type' });

    const notJson = await ingest(url, 'not json', {
      'stripe-signature': await stripeSignature(secret, 'not json'),
    });
    expect(notJson.body.data).toEqual({ outcome: 'dropped', reason: 'invalid_data' });

    const ancient = JSON.stringify({ ...stripeEvent(`evt_${uniq()}`, customer), created: 1_600_000_000 });
    const stale = await ingest(url, ancient, { 'stripe-signature': await stripeSignature(secret, ancient) });
    expect(stale.status).toBe(200);
    expect(stale.body.data).toEqual({ outcome: 'dropped', reason: 'invalid_data' });

    const deliveries = await api<{ items: DeliveryBody[] }>(
      `/v1/sources/${created.body.data?.id}/deliveries`,
      {
        headers: keyBearer,
      }
    );
    expect(deliveries.status).toBe(200);
    const eventsOnly = await api<{ items: DeliveryBody[] }>(
      `/v1/sources/${created.body.data?.id}/deliveries?outcome=event`,
      { headers: keyBearer }
    );
    expect(eventsOnly.body.data?.items.map((item) => item.outcome)).toEqual(['event']);
    expect(deliveries.body.data?.items.map((item) => item.outcome)).toEqual([
      'dropped',
      'dropped',
      'dropped',
      'dropped',
      'dropped',
      'rejected',
      'rejected',
      'duplicate',
      'event',
    ]);
    const first = deliveries.body.data?.items.at(-1);
    expect(first?.id).toMatch(/^sdl_/);
    expect(first?.event).toBe('payment.succeeded');
    expect(first?.eventId).toMatch(/^evt_/);
    expect(first?.subscriberId).toMatch(/^sub_/);
    expect(first?.providerType).toBe('invoice.paid');
    const filteredRow = deliveries.body.data?.items.find((item) => item.reason === 'filtered');
    expect(filteredRow?.providerType).toBe('invoice.paid');
    expect(filteredRow?.providerEventId).toMatch(/^evt_/);
    const rejectedRow = deliveries.body.data?.items.find((item) => item.outcome === 'rejected');
    expect(rejectedRow?.providerType).toBe('invoice.paid');

    const source = await api<SourceBody>(`/v1/sources/${created.body.data?.id}`, { headers: keyBearer });
    expect(source.body.data?.lastDeliveryAt).not.toBeNull();

    const timelineAfter = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timelineAfter.body.data?.items.map((item) => item.name)).toEqual([
      '$subscriber.created',
      'payment.succeeded',
    ]);
  });

  it('records deliveries on an unverified source without creating events, and drops them while paused', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;
    await identify(keyBearer, externalId);
    const created = await createSource(keyBearer, { name: 'Backend', provider: 'custom' });
    const url = created.body.data!.url;
    const body = JSON.stringify({ id: 'e1', type: 'order.shipped', userId: externalId });

    const unverified = await ingest(url, body, { 'x-buzzkit-secret': 'anything' });
    expect(unverified.status).toBe(200);
    expect(unverified.body.data?.outcome).toBe('unverified');

    await api(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ secret: 'shared', status: 'paused' }),
    });
    const paused = await ingest(url, body, { 'x-buzzkit-secret': 'shared' });
    expect(paused.body.data).toEqual({ outcome: 'dropped', reason: 'paused' });

    await api(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ status: 'active' }),
    });
    const accepted = await ingest(url, body, { 'x-buzzkit-secret': 'shared' });
    expect(accepted.body.data?.outcome).toBe('event');

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items.map((item) => item.name)).toEqual([
      'order.shipped',
      '$subscriber.created',
    ]);
    expect(timeline.body.data?.items[0]?.data).toEqual({ $provider: 'custom' });
  });

  it('lets a custom source use any verification scheme, since a provider is only a template', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;
    await identify(keyBearer, externalId);
    const secret = 'whsec_c2VjcmV0X3NlY3JldF9zZWNyZXQ=';
    const created = await createSource(keyBearer, {
      name: 'Own backend',
      provider: 'custom',
      secret,
      verification: {
        scheme: 'standard-webhooks',
        headers: { id: 'svix-id', timestamp: 'svix-timestamp', signature: 'svix-signature' },
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.verification).toEqual({
      scheme: 'standard-webhooks',
      headers: { id: 'svix-id', timestamp: 'svix-timestamp', signature: 'svix-signature' },
    });
    const url = created.body.data!.url;
    const body = JSON.stringify({ id: 'e1', type: 'order.shipped', userId: externalId });
    const timestamp = Math.floor(Date.now() / 1000);
    const accepted = await ingest(url, body, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(timestamp),
      'svix-signature': await signWebhook(secret, 'msg_1', timestamp, body),
    });
    expect(accepted.body.data?.outcome).toBe('event');
    const wrongHeader = await ingest(url, body, { 'x-buzzkit-secret': secret });
    expect(wrongHeader.status).toBe(401);

    const switched = await api<SourceBody>(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ verification: { scheme: 'header', header: 'x-own-secret' }, secret: 'plain' }),
    });
    expect(switched.status).toBe(200);
    const plain = await ingest(url, JSON.stringify({ id: 'e2', type: 'order.shipped', userId: externalId }), {
      'x-own-secret': 'plain',
    });
    expect(plain.body.data?.outcome).toBe('event');

    const badScheme = await api(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ verification: { scheme: 'magic' } }),
    });
    expect(badScheme.status).toBe(400);
    expect(badScheme.body.error?.code).toBe('invalid_verification');
    const badProvider = await createSource(keyBearer, { name: 'x', provider: 'adapty' });
    expect(badProvider.status).toBe(400);
  });

  it('turns a signed RevenueCat delivery into a subscriber event with the trial period kept', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;
    await identify(keyBearer, externalId);
    const secret = `rc_${uniq()}`;
    const created = await createSource(keyBearer, { name: 'RevenueCat', provider: 'revenuecat', secret });
    expect(created.body.data?.verification).toEqual({
      scheme: 'stripe',
      header: 'x-revenuecat-webhook-signature',
    });
    const url = created.body.data!.url;
    const body = JSON.stringify({
      api_version: '1.0',
      event: {
        id: `evt_${uniq()}`,
        type: 'INITIAL_PURCHASE',
        app_user_id: externalId,
        event_timestamp_ms: Date.now() - 60_000,
        product_id: 'pro.monthly',
        period_type: 'TRIAL',
        price: 0,
        currency: 'USD',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
      },
    });
    const accepted = await ingest(url, body, {
      'x-revenuecat-webhook-signature': await stripeSignature(secret, body),
    });
    expect(accepted.body.data?.outcome).toBe('event');
    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    const event = timeline.body.data?.items.find((item) => item.name === 'subscription.started');
    expect(event?.data).toMatchObject({
      productId: 'pro.monthly',
      periodType: 'TRIAL',
      store: 'APP_STORE',
      $provider: 'revenuecat',
    });

    const test = JSON.stringify({
      api_version: '1.0',
      event: { id: 'e2', type: 'TEST', app_user_id: externalId, environment: 'PRODUCTION' },
    });
    const dropped = await ingest(url, test, {
      'x-revenuecat-webhook-signature': await stripeSignature(secret, test),
    });
    expect(dropped.body.data).toEqual({ outcome: 'dropped', reason: 'unlisted_type' });
  });

  it('previews with the subscriber and duplicates resolved, and takes a mapping override', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const created = await createSource(keyBearer, { name: 'Stripe', provider: 'stripe' });
    const preview = (body: Record<string, unknown>) =>
      api<{
        outcome: string;
        reason?: string;
        event?: { name: string; externalId?: string };
        suggestions: { provider: string | null };
      }>(`/v1/sources/${created.body.data?.id}/preview`, {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify(body),
      });

    const payload = stripeEvent('evt_p1', 'cus_preview_1', 'customer.subscription.created');
    const orphan = await preview({ payload: JSON.parse(JSON.stringify(payload)) });
    expect(orphan.body.data).toMatchObject({ outcome: 'dropped', reason: 'no_subscriber' });
    expect(orphan.body.data?.suggestions.provider).toBe('stripe');

    const externalId = `user_${uniq()}`;
    await identify(keyBearer, externalId, { stripeCustomerId: 'cus_preview_1' });
    const resolved = await preview({ payload });
    expect(resolved.body.data?.outcome).toBe('event');
    expect(resolved.body.data?.event).toMatchObject({ name: 'subscription.started', externalId });

    const override = await preview({
      payload: { type: 'anything.went', userId: externalId },
      mapping: { type: 'type', subscriber: 'userId', events: { '*': true } },
    });
    expect(override.body.data?.event).toMatchObject({ name: 'anything.went', externalId });
  });

  it('switches provider, verification and mapping together when a preset is applied', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const created = await createSource(keyBearer, { name: 'Mystery', provider: 'custom' });
    const switched = await api<SourceBody>(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({
        provider: 'stripe',
        verification: { scheme: 'stripe' },
        mapping: {
          type: 'type',
          id: 'id',
          subscriber: { path: 'data.object.customer', attribute: 'stripeCustomerId' },
          events: { 'invoice.paid': 'payment.succeeded' },
        },
      }),
    });
    expect(switched.status).toBe(200);
    expect(switched.body.data).toMatchObject({
      provider: 'stripe',
      verification: { scheme: 'stripe' },
      status: 'unverified',
    });
    const rejected = await api(`/v1/sources/${created.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'nonsense' }),
    });
    expect(rejected.status).toBe(400);
  });

  it('is unknown to other tenants and to keys without the scope', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const other = await setupWorkspace({ bare: true });
    const created = await createSource(keyBearer, { name: 'Stripe', provider: 'stripe' });
    const foreign = await api(`/v1/sources/${created.body.data?.id}`, { headers: other.keyBearer });
    expect(foreign.status).toBe(404);
    const missing = await ingest('/v1/sources/src_nope/ingest', '{}');
    expect(missing.status).toBe(404);
  });
});
