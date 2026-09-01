import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { subscribe } from '../../utils/workflows';

async function setPolicy(headers: Record<string, string>, sendPolicy: unknown) {
  const { status, body } = await api('/v1/tenants/default', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ settings: { sendPolicy } }),
  });
  return { status, body };
}

describe('tenant send policy', () => {
  it('stores, resolves, clears, and validates the policy', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };

    const set = await setPolicy(headers, {
      quietHours: { from: '22:00', to: '08:00' },
      dailyCap: 3,
    });
    expect(set.status).toBe(200);
    const settings = (set.body.data as { settings: { sendPolicy: Record<string, unknown> } }).settings;
    expect(settings.sendPolicy).toEqual({
      quietHours: { from: '22:00', to: '08:00', timezone: 'subscriber' },
      dailyCap: 3,
    });

    const cleared = await setPolicy(headers, { quietHours: null });
    const clearedSettings = (cleared.body.data as { settings: { sendPolicy: Record<string, unknown> } })
      .settings;
    expect(clearedSettings.sendPolicy).toEqual({ quietHours: null, dailyCap: 3 });

    expect((await setPolicy(headers, { quietHours: { from: '9:00', to: '17:00' } })).status).toBe(400);
    expect((await setPolicy(headers, { quietHours: { from: '09:00', to: '09:00' } })).status).toBe(400);
    expect((await setPolicy(headers, { dailyCap: 0 })).status).toBe(400);
    expect((await setPolicy(headers, { dailyCap: 'many' })).status).toBe(400);
    expect((await setPolicy(headers, { weeklyCap: 2 })).status).toBe(400);
    expect(
      (await setPolicy(headers, { quietHours: { from: '22:00', to: '08:00', timezone: 'Mars/Base' } })).status
    ).toBe(400);
  });

  it('defers deliveries inside quiet hours and lets policy: ignore through', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    await setPolicy(headers, { quietHours: { from: '00:00', to: '23:59', timezone: 'UTC' } });

    const externalId = `user_${uniq()}`;
    await subscribe(headers, externalId);

    const quiet = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'Quiet test' }),
    });
    expect(quiet.status).toBe(202);

    const delivery = await eventually(
      async () => {
        const { body } = await api<{
          items: Array<{ id: string; status: string; nextAttemptAt: string | null }>;
        }>(`/v1/subscribers/${externalId}/deliveries`, { headers });
        return body.data?.items.find((item) => item.status === 'pending' && item.nextAttemptAt !== null);
      },
      { label: 'deferred delivery' }
    );
    expect(Date.parse(delivery.nextAttemptAt as string)).toBeGreaterThan(Date.now() + 30_000);

    const ignored = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'Security alert', policy: 'ignore' }),
    });
    expect(ignored.status).toBe(202);
    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ message: { id: string }; status: string }> }>(
          `/v1/subscribers/${externalId}/deliveries`,
          { headers }
        );
        const rows = body.data?.items ?? [];
        return rows.some(
          (item) => item.status === 'failed' || item.status === 'retrying' || item.status === 'sent'
        )
          ? rows
          : undefined;
      },
      { label: 'ignored delivery attempted' }
    );
  });
});

describe('daily cap', () => {
  it('fails the delivery as capped once the day is spent, and counts only sent', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    await setPolicy(headers, { dailyCap: 1 });

    const externalId = `user_${uniq()}`;
    await subscribe(headers, externalId);

    const first = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'First of the day' }),
    });
    expect(first.status).toBe(202);

    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ id: string; status: string }> }>(
          `/v1/subscribers/${externalId}/deliveries`,
          { headers }
        );
        return body.data?.items[0];
      },
      { label: 'first delivery row' }
    );

    const [subscriberRow] = await db
      .select({ id: tables.subscriber.id })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    await db
      .update(tables.delivery)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(tables.delivery.subscriberId, subscriberRow!.id));

    const second = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'Second of the day' }),
    });
    expect(second.status).toBe(202);

    const cappedDelivery = await eventually(
      async () => {
        const { body } = await api<{
          items: Array<{ status: string; lastErrorCode: string | null }>;
        }>(`/v1/subscribers/${externalId}/deliveries`, { headers });
        return body.data?.items.find((item) => item.status === 'failed' && item.lastErrorCode === 'capped');
      },
      { label: 'capped delivery' }
    );
    expect(cappedDelivery.lastErrorCode).toBe('capped');

    const exempt = await api('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'Break glass', policy: 'ignore' }),
    });
    expect(exempt.status).toBe(202);
    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ status: string; lastErrorCode: string | null }> }>(
          `/v1/subscribers/${externalId}/deliveries`,
          { headers }
        );
        const rows = body.data?.items ?? [];
        const nonCapped = rows.filter((item) => item.lastErrorCode !== 'capped');
        return nonCapped.some((item) => item.status !== 'pending') ? rows : undefined;
      },
      { label: 'exempt delivery attempted' }
    );
  });
});

describe('topic daily cap', () => {
  it('caps a topic independently of the tenant, leaving other sends untouched', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    const topicSlug = `reminders-${uniq()}`.slice(0, 24);
    const created = await api('/v1/topics', {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug: topicSlug, name: 'Reminders', channels: ['push'], dailyCap: 1 }),
    });
    expect(created.status).toBe(201);
    expect((created.body.data as { dailyCap: number }).dailyCap).toBe(1);

    const externalId = `user_${uniq()}`;
    await subscribe(headers, externalId);
    await api(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ preferences: { [topicSlug]: true } }),
    });

    const first = await api('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: topicSlug, title: 'Reminder one' }),
    });
    expect(first.status).toBe(202);

    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ id: string }> }>(
          `/v1/subscribers/${externalId}/deliveries`,
          { headers }
        );
        return body.data?.items[0];
      },
      { label: 'first topic delivery' }
    );
    const [subscriberRow] = await db
      .select({ id: tables.subscriber.id })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    await db
      .update(tables.delivery)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(tables.delivery.subscriberId, subscriberRow!.id));

    const second = await api('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: topicSlug, title: 'Reminder two' }),
    });
    expect(second.status).toBe(202);
    const capped = await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ status: string; lastErrorCode: string | null }> }>(
          `/v1/subscribers/${externalId}/deliveries`,
          { headers }
        );
        return body.data?.items.find((item) => item.status === 'failed' && item.lastErrorCode === 'capped');
      },
      { label: 'topic-capped delivery' }
    );
    expect(capped.lastErrorCode).toBe('capped');

    const direct = await api('/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: externalId, title: 'Not the topic' }),
    });
    expect(direct.status).toBe(202);
    await eventually(
      async () => {
        const { body } = await api<{
          items: Array<{ status: string; lastErrorCode: string | null }>;
        }>(`/v1/subscribers/${externalId}/deliveries`, { headers });
        const rows = body.data?.items ?? [];
        const others = rows.filter((item) => item.lastErrorCode !== 'capped' && item.status !== 'sent');
        return others.some((item) => item.status !== 'pending') ? rows : undefined;
      },
      { label: 'untopiced delivery attempted' }
    );
  });
});
