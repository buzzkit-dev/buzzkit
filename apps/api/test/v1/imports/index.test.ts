import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { fakeToken } from '../../utils/fixtures';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

type ImportResult = {
  counts: {
    rows: number;
    subscribersCreated: number;
    subscriptionsCreated: number;
    subscriptionsUpdated: number;
    unchanged: number;
    failed: number;
  };
  failures: Array<{ index: number; code: string; message: string; param: string | null }>;
};

type SubscriberDetail = {
  externalId: string;
  attributes: Record<string, unknown>;
  subscriptions: Array<{
    channel: string;
    platform: string | null;
    environment: string;
    endpoint: string;
    enabled: boolean;
    lastSeenAt: string;
  }>;
};

async function importRows(headers: Record<string, string>, rows: unknown[]) {
  return api<ImportResult>('/v1/imports', { method: 'POST', headers, body: JSON.stringify({ rows }) });
}

async function subscriberOf(headers: Record<string, string>, externalId: string) {
  const { status, body } = await api<SubscriberDetail>(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
    headers,
  });
  expect(status).toBe(200);
  return body.data!;
}

describe('POST /v1/imports', () => {
  it('imports push, email and profile-only rows with their attributes, system attributes and last activity', async () => {
    const { keyBearer } = await setupWorkspace();
    const first = `user_${uniq()}`;
    const second = `user_${uniq()}`;
    const third = `user_${uniq()}`;
    const token = fakeToken();
    const seenAt = '2026-08-01T10:00:00.000Z';

    const { status, body } = await importRows(keyBearer, [
      {
        externalId: first,
        platform: 'ios',
        token,
        attributes: { plan: 'pro', level: 4 },
        timezone: 'Europe/Berlin',
        language: 'de',
        country: 'DE',
        device: { appVersion: '3.2.0', osVersion: '17.4', model: 'iPhone15,2' },
        lastSeenAt: seenAt,
      },
      { externalId: first, channel: 'email', address: `${first}@acme.com` },
      { externalId: second, platform: 'android', token: fakeToken('b'), enabled: false },
      { externalId: third, attributes: { plan: 'free' } },
    ]);

    expect(status).toBe(200);
    expect(body.data).toEqual({
      counts: {
        rows: 4,
        subscribersCreated: 3,
        subscriptionsCreated: 3,
        subscriptionsUpdated: 0,
        unchanged: 1,
        failed: 0,
      },
      failures: [],
    });

    const detail = await subscriberOf(keyBearer, first);
    expect(detail.attributes).toEqual({
      plan: 'pro',
      level: 4,
      $timezone: 'Europe/Berlin',
      $language: 'de',
      $country: 'DE',
      $appVersion: '3.2.0',
      $osVersion: '17.4',
      $deviceModel: 'iPhone15,2',
      email: `${first}@acme.com`,
    });
    expect(detail.subscriptions.map((subscription) => subscription.channel).sort()).toEqual([
      'email',
      'push',
    ]);
    const push = detail.subscriptions.find((subscription) => subscription.channel === 'push')!;
    expect(push).toMatchObject({
      platform: 'ios',
      environment: 'production',
      endpoint: token,
      enabled: true,
    });
    expect(push.lastSeenAt).toBe(seenAt);

    const muted = await subscriberOf(keyBearer, second);
    expect(muted.subscriptions[0]).toMatchObject({ platform: 'android', enabled: false });

    const profile = await subscriberOf(keyBearer, third);
    expect(profile.attributes).toEqual({ plan: 'free' });
    expect(profile.subscriptions).toEqual([]);
  });

  it('is idempotent: a second identical import writes nothing and never moves last activity backwards', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const token = fakeToken();
    const rows = [{ externalId, platform: 'ios', token, lastSeenAt: '2026-08-01T10:00:00.000Z' }];

    await importRows(keyBearer, rows);
    const again = await importRows(keyBearer, [{ ...rows[0], lastSeenAt: '2026-07-01T10:00:00.000Z' }]);

    expect(again.body.data?.counts).toMatchObject({
      subscribersCreated: 0,
      subscriptionsCreated: 0,
      subscriptionsUpdated: 0,
      unchanged: 1,
    });
    const [row] = await db
      .select({ lastSeenAt: tables.subscription.lastSeenAt })
      .from(tables.subscription)
      .where(eq(tables.subscription.endpoint, token));
    expect(row?.lastSeenAt.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('merges attributes into an existing subscriber instead of replacing them', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { name: 'Maya', plan: 'free' } }),
    });

    const { body } = await importRows(keyBearer, [{ externalId, attributes: { plan: 'pro' } }]);

    expect(body.data?.counts).toMatchObject({ subscribersCreated: 0, unchanged: 1 });
    const detail = await subscriberOf(keyBearer, externalId);
    expect(detail.attributes).toEqual({ name: 'Maya', plan: 'pro' });
  });

  it('reports row failures by index and imports the rest', async () => {
    const { keyBearer } = await setupWorkspace();
    const good = `user_${uniq()}`;

    const { status, body } = await importRows(keyBearer, [
      { externalId: `user_${uniq()}`, token: fakeToken() },
      { externalId: good, platform: 'ios', token: fakeToken() },
      { externalId: `user_${uniq()}`, timezone: 'Mars/Olympus' },
      { externalId: `user_${uniq()}`, attributes: { $country: 'DE' } },
    ]);

    expect(status).toBe(200);
    expect(body.data?.counts).toMatchObject({
      rows: 4,
      subscribersCreated: 1,
      subscriptionsCreated: 1,
      failed: 3,
    });
    expect(body.data?.failures.map((failure) => [failure.index, failure.code])).toEqual([
      [0, 'bad_request'],
      [2, 'invalid_timezone'],
      [3, 'system_attribute'],
    ]);
    expect(body.data?.failures[0]?.param).toBe('platform');
    await subscriberOf(keyBearer, good);
  });

  it('refuses the whole batch when a row needs a channel that is not connected', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer, 'Bare', { bare: true });

    const { status, body } = await importRows({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, [
      { externalId: `user_${uniq()}`, platform: 'ios', token: fakeToken() },
    ]);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('channel_not_connected');
  });

  it('keeps an email as profile metadata when the email channel is not connected', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer, 'Bare email import', { bare: true });
    const headers = { ...keyBearer, 'buzzkit-tenant': tenant.slug };
    const externalId = `user_${uniq()}`;
    const address = `${externalId}@acme.com`;

    const { status, body } = await importRows(headers, [
      { externalId, channel: 'email', address, attributes: { plan: 'pro' } },
    ]);

    expect(status).toBe(200);
    expect(body.data?.counts).toMatchObject({
      rows: 1,
      subscribersCreated: 1,
      subscriptionsCreated: 0,
      unchanged: 1,
      failed: 0,
    });
    const detail = await subscriberOf(headers, externalId);
    expect(detail.attributes).toEqual({ plan: 'pro', email: address });
    expect(detail.subscriptions).toEqual([]);
  });

  it('treats attributes.email as the email: a profile row subscribes it, subscribe.email false keeps it as data', async () => {
    const { keyBearer } = await setupWorkspace();
    const subscribed = `user_${uniq()}`;
    const dataOnly = `user_${uniq()}`;
    const withDevice = `user_${uniq()}`;
    const token = fakeToken();

    const { status, body } = await importRows(keyBearer, [
      { externalId: subscribed, attributes: { email: `${subscribed}@acme.com` } },
      { externalId: dataOnly, attributes: { email: `${dataOnly}@acme.com` }, subscribe: { email: false } },
      { externalId: withDevice, platform: 'ios', token, attributes: { email: `${withDevice}@acme.com` } },
      { externalId: `user_${uniq()}`, attributes: { email: 'not an address' } },
    ]);

    expect(status).toBe(200);
    expect(body.data?.counts).toMatchObject({
      rows: 4,
      subscribersCreated: 3,
      subscriptionsCreated: 3,
      unchanged: 2,
      failed: 1,
    });
    expect(body.data?.failures).toEqual([
      { index: 3, code: 'invalid_email', message: expect.any(String), param: 'attributes.email' },
    ]);

    const first = await subscriberOf(keyBearer, subscribed);
    expect(first.subscriptions.map((subscription) => subscription.channel)).toEqual(['email']);
    expect(first.subscriptions[0]?.endpoint).toBe(`${subscribed}@acme.com`);

    const second = await subscriberOf(keyBearer, dataOnly);
    expect(second.attributes).toEqual({ email: `${dataOnly}@acme.com` });
    expect(second.subscriptions).toEqual([]);

    const third = await subscriberOf(keyBearer, withDevice);
    expect(third.subscriptions.map((subscription) => subscription.channel).sort()).toEqual(['email', 'push']);
  });

  it('caps a batch at 1000 rows', async () => {
    const { keyBearer } = await setupWorkspace();
    const rows = Array.from({ length: 1001 }, (_, index) => ({ externalId: `user_${index}` }));

    const { status } = await importRows(keyBearer, rows);

    expect(status).toBe(400);
  });

  it('writes the subscriber lifecycle to the stream', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await importRows(keyBearer, [
      { externalId, platform: 'ios', token: fakeToken(), attributes: { plan: 'pro' } },
    ]);

    const names = await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ name: string }> }>(
          `/v1/subscribers/${encodeURIComponent(externalId)}/timeline`,
          { headers: keyBearer }
        );
        const items = body.data?.items.map((item) => item.name) ?? [];
        return items.length >= 2 ? items.sort() : undefined;
      },
      { label: `timeline of ${externalId}` }
    );
    expect(names).toEqual(['$subscriber.created', '$subscription.registered']);
  });
});
