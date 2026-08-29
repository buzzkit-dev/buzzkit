import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { fakeToken } from '../../utils/fixtures';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Stats = {
  range: { from: string; to: string };
  interval: string;
  subscribers: { total: number; added: number };
  messages: { total: number };
  deliveries: { total: number; sent: number; failed: number; invalid: number; pending: number };
  previous: {
    subscribers: { added: number };
    messages: { total: number };
    deliveries: { total: number; sent: number; failed: number; invalid: number; pending: number };
  };
  series: Array<{
    date: string;
    subscribers: number;
    messages: number;
    sent: number;
    failed: number;
    invalid: number;
    pending: number;
  }>;
};

async function stats(headers: Record<string, string>, query = '') {
  return api<Stats>(`/v1/stats${query}`, { headers });
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

describe('GET /v1/stats', () => {
  it('starts at zero with a full week of empty days', async () => {
    const { keyBearer } = await setupWorkspace();
    const { status, body } = await stats(keyBearer);
    expect(status).toBe(200);
    const data = body.data!;
    expect(data.subscribers).toEqual({ total: 0, added: 0 });
    expect(data.messages).toEqual({ total: 0 });
    expect(data.deliveries).toEqual({ total: 0, sent: 0, failed: 0, invalid: 0, pending: 0 });
    expect(data.previous).toEqual({
      subscribers: { added: 0 },
      messages: { total: 0 },
      deliveries: { total: 0, sent: 0, failed: 0, invalid: 0, pending: 0 },
      events: { total: 0 },
      runs: { started: 0, live: 0, completed: 0, cancelled: 0, failed: 0 },
    });
    expect(data.interval).toBe('day');
    expect(data.series.length).toBeGreaterThanOrEqual(7);
    expect(data.series.length).toBeLessThanOrEqual(9);
    for (const day of data.series) expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(new Date(data.range.to).getTime() - new Date(data.range.from).getTime()).toBe(7 * 86_400_000);
    for (const day of data.series)
      expect(day).toMatchObject({ subscribers: 0, messages: 0, sent: 0, failed: 0, invalid: 0, pending: 0 });
    expect(data.series.map((day) => day.date)).toEqual([...data.series.map((day) => day.date)].sort());
  });

  it('counts subscribers, messages and settled deliveries in the range', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const externalId = `user_${uniq()}`;
    const registered = await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });
    expect(registered.status).toBe(201);
    const sent = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ to: externalId, title: 'Hello' }),
    });
    expect(sent.status).toBe(202);

    const settled = await waitFor(async () => {
      const { body } = await stats(keyBearer);
      return body.data && body.data.deliveries.pending === 0 && body.data.deliveries.total > 0
        ? body.data
        : null;
    });
    expect(settled.subscribers).toEqual({ total: 1, added: 1 });
    expect(settled.messages.total).toBe(1);
    expect(settled.deliveries.total).toBe(1);
    expect(settled.deliveries.sent + settled.deliveries.failed + settled.deliveries.invalid).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    const day = settled.series.find((entry) => entry.date.startsWith(today));
    expect(day).toBeDefined();
    expect(day!.sent + day!.failed + day!.invalid).toBe(1);
    expect(day!.subscribers).toBe(1);
    expect(day!.messages).toBe(1);

    const before = await stats(
      keyBearer,
      `?to=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`
    );
    expect(before.body.data?.subscribers).toEqual({ total: 1, added: 0 });
    expect(before.body.data?.messages.total).toBe(0);
    expect(before.body.data?.deliveries.total).toBe(0);

    const after = await stats(
      keyBearer,
      `?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000 + 600_000).toISOString())}`
    );
    expect(after.body.data?.messages.total).toBe(0);
    expect(after.body.data?.previous.messages.total).toBe(1);
    expect(after.body.data?.previous.subscribers.added).toBe(1);
    expect(after.body.data?.previous.deliveries.total).toBe(1);
  });

  it('picks the bucket from the window and honours an explicit interval', async () => {
    const { keyBearer } = await setupWorkspace();
    const now = Date.now();
    const hourly = await stats(
      keyBearer,
      `?from=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}`
    );
    expect(hourly.body.data?.interval).toBe('hour');
    expect(hourly.body.data?.series.length).toBeGreaterThanOrEqual(24);
    expect(hourly.body.data?.series.length).toBeLessThanOrEqual(26);
    expect(hourly.body.data?.series[0]?.date).toMatch(/T\d{2}:00:00Z$/);

    const weekly = await stats(
      keyBearer,
      `?from=${encodeURIComponent(new Date(now - 30 * 86_400_000).toISOString())}&interval=week`
    );
    expect(weekly.body.data?.interval).toBe('week');
    expect(weekly.body.data?.series.length).toBeGreaterThanOrEqual(5);
    expect(weekly.body.data?.series.length).toBeLessThanOrEqual(6);
    for (const week of weekly.body.data?.series ?? []) expect(new Date(week.date).getUTCDay()).toBe(1);

    const yearly = await stats(
      keyBearer,
      `?from=${encodeURIComponent(new Date(now - 365 * 86_400_000).toISOString())}`
    );
    expect(yearly.body.data?.interval).toBe('month');
    expect(yearly.body.data?.series.length).toBeGreaterThanOrEqual(12);
    expect(yearly.body.data?.series.length).toBeLessThanOrEqual(13);

    const bad = await stats(keyBearer, '?interval=fortnight');
    expect(bad.status).toBe(400);
  });

  it('rejects inverted and oversized ranges', async () => {
    const { keyBearer } = await setupWorkspace();
    const now = new Date();
    const inverted = await stats(
      keyBearer,
      `?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(new Date(now.getTime() - 1000).toISOString())}`
    );
    expect(inverted.status).toBe(400);
    expect(inverted.body.error?.param).toBe('from');

    const oversized = await stats(
      keyBearer,
      `?from=${encodeURIComponent(new Date(now.getTime() - 400 * 86_400_000).toISOString())}`
    );
    expect(oversized.status).toBe(400);

    const malformed = await stats(keyBearer, '?from=yesterday');
    expect(malformed.status).toBe(400);
  });

  it('is scoped to the tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer, 'Other');
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const mine = await stats(keyBearer);
    expect(mine.body.data?.subscribers.total).toBe(1);
    const theirs = await stats({ ...keyBearer, 'buzzkit-tenant': other.slug });
    expect(theirs.body.data?.subscribers.total).toBe(0);
  });

  it('counts events, runs, top events, active workflows and scheduled messages', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const externalId = `user_${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });
    const slug = `welcome-${uniq()}`;
    await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug,
        name: 'Welcome',
        spec: {
          trigger: { event: 'signup' },
          steps: [{ name: 'hold', waitFor: { event: 'never', until: '2d' } }],
        },
      }),
    });
    await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers: keyBearer });
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId, name: 'signup' },
          { externalId, name: 'screen.viewed' },
          { externalId, name: 'screen.viewed' },
        ],
      }),
    });
    await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        to: externalId,
        title: 'Later',
        schedule: { at: '2030-01-01T09:00', timezone: 'Europe/Berlin' },
      }),
    });

    const settled = await waitFor(async () => {
      const { body } = await stats(keyBearer);
      return body.data && body.data.runs.started === 1 && body.data.events.total >= 3 ? body.data : null;
    }, 60_000);
    expect(settled.events.total).toBeGreaterThanOrEqual(3);
    expect(settled.topEvents[0]).toMatchObject({ name: 'screen.viewed', count: 2 });
    expect(settled.runs).toMatchObject({ started: 1, live: 1, completed: 0, failed: 0 });
    expect(settled.workflows).toEqual([
      { slug, name: 'Welcome', running: 0, sleeping: 0, waiting: 1, lastRunAt: expect.any(String) },
    ]);
    expect(settled.scheduled.count).toBe(1);
    expect(settled.scheduled.nextAt).toBe('2030-01-01T08:00:00.000Z');
    const today = new Date().toISOString().slice(0, 10);
    const day = settled.series.find((entry) => entry.date.startsWith(today));
    expect(day?.runsStarted).toBe(1);
    expect(day?.events).toBeGreaterThanOrEqual(3);
  }, 90_000);
});
