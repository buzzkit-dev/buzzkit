import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type RunEvent = { name: string; data: Record<string, unknown> };
type MessageItem = { id: string; payload: { title?: string } };
type Delivery = { status: string; lastErrorCode: string | null; message: { id: string } };

async function sentTitles(headers: Headers) {
  const { body } = await api<{ items: MessageItem[] }>('/v1/messages?limit=50', { headers });
  return (body.data?.items ?? []).map((item) => item.payload.title ?? '').reverse();
}

function summaries(events: RunEvent[], step: string) {
  return events.filter((item) => item.data.step === step).map((item) => item.data.summary);
}

async function completed(headers: Headers, user: string) {
  await eventually(
    async () => (await runEvents(headers, user)).some((item) => item.name === '$run.completed'),
    { label: `run completed for ${user}`, timeoutMs: 120_000, intervalMs: 300 }
  );
  return await runEvents(headers, user);
}

async function settle(ms = 1500) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('workflow lifecycle', () => {
  it('keeps a live run on its pinned version after a republish and lets it finish while paused', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `pinned_${uniq()}`;
    await subscribe(keyBearer, user);
    const slug = `pinned-${uniq()}`;
    const spec = (title: string) => ({
      trigger: { event: 'go' },
      steps: [
        { name: 'settle', wait: '1d' },
        { name: 'hello', send: { title } },
      ],
    });
    await publish(keyBearer, slug, spec('From version one'));

    await track(keyBearer, user, 'go');
    await eventually(
      async () =>
        (await runEvents(keyBearer, user)).some(
          (item) => item.data.step === 'settle' && item.data.status === 'sleeping'
        ),
      { label: 'run sleeping on version one', timeoutMs: 30_000, intervalMs: 300 }
    );

    const patched = await api<{ draft: { number: number } | null }>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ spec: spec('From version two') }),
    });
    expect(patched.body.data?.draft?.number).toBe(2);
    expect((await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers: keyBearer })).status).toBe(
      200
    );
    expect((await api(`/v1/workflows/${slug}/pause`, { method: 'POST', headers: keyBearer })).status).toBe(
      200
    );

    const events = await completed(keyBearer, user);
    expect(summaries(events, 'hello')).toEqual(['Sent “From version one”']);
    expect(await sentTitles(keyBearer)).toEqual(['From version one']);

    await track(keyBearer, user, 'go');
    await settle();
    expect((await runEvents(keyBearer, user)).filter((item) => item.name === '$run.started')).toHaveLength(1);
  }, 90_000);

  it('starts a run from a webhook source delivery and only from that source', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `hooked_${uniq()}`;
    await subscribe(keyBearer, user);
    const created = await api<{ id: string; url: string }>('/v1/sources', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Backend', provider: 'custom' }),
    });
    expect(created.status).toBe(201);
    const source = created.body.data!;
    for (const patch of [{ secret: 'shared', status: 'paused' }, { status: 'active' }]) {
      const response = await api(`/v1/sources/${source.id}`, {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify(patch),
      });
      expect(response.status).toBe(200);
    }
    await publish(keyBearer, `hooks-${uniq()}`, {
      trigger: { event: 'order.shipped', sources: ['webhook'] },
      steps: [{ name: 'note', set: { var: 'carrier', value: '{{ trigger.data.$provider }}' } }],
    });

    await track(keyBearer, user, 'order.shipped');
    await settle();
    expect((await runEvents(keyBearer, user)).filter((item) => item.name === '$run.started')).toEqual([]);

    const ingested = await api<{ outcome: string }>(source.url, {
      method: 'POST',
      headers: { 'x-buzzkit-secret': 'shared' },
      body: JSON.stringify({ id: `evt-${uniq()}`, type: 'order.shipped', userId: user }),
    });
    expect(ingested.body.data?.outcome).toBe('event');
    const events = await completed(keyBearer, user);
    expect(events.filter((item) => item.name === '$run.started')).toHaveLength(1);
    expect(summaries(events, 'note')).toEqual(['Set carrier to “custom”']);
  }, 60_000);

  it('fails a workflow send as capped once the tenant daily cap is spent, and exempts policy: ignore', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    const policy = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ settings: { sendPolicy: { dailyCap: 1 } } }),
    });
    expect(policy.status).toBe(200);
    const user = `capped_${uniq()}`;
    await subscribe(headers, user);
    await publish(headers, `cap-${uniq()}`, {
      trigger: { event: 'streak.at-risk' },
      steps: [
        { name: 'first', send: { title: 'First of the day' } },
        { name: 'later', waitFor: { event: 'go', timeout: '2d' } },
        { name: 'second', send: { title: 'Second of the day' } },
        { name: 'exempt', send: { title: 'Break glass', policy: 'ignore' } },
      ],
    });

    await track(headers, user, 'streak.at-risk');
    const firstRow = await eventually(
      async () => {
        const { body } = await api<{ items: Delivery[] }>(`/v1/subscribers/${user}/deliveries`, { headers });
        return body.data?.items[0];
      },
      { label: 'first delivery row', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(firstRow.lastErrorCode).not.toBe('capped');
    const [subscriberRow] = await db
      .select({ id: tables.subscriber.id })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, user));
    await db
      .update(tables.delivery)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(tables.delivery.subscriberId, subscriberRow!.id));

    await track(headers, user, 'go');
    const events = await completed(headers, user);
    const messageIdOf = (step: string) =>
      events.find((item) => item.data.step === step && item.data.status === 'completed')?.data.messageId;
    const deliveries = await eventually(
      async () => {
        const { body } = await api<{ items: Delivery[] }>(`/v1/subscribers/${user}/deliveries`, { headers });
        const items = body.data?.items ?? [];
        const exempt = items.find((item) => item.message.id === messageIdOf('exempt'));
        return exempt && exempt.status !== 'pending' ? items : undefined;
      },
      { label: 'exempt delivery attempted', timeoutMs: 60_000, intervalMs: 500 }
    );
    const second = deliveries.find((item) => item.message.id === messageIdOf('second'));
    expect(second).toMatchObject({ status: 'failed', lastErrorCode: 'capped' });
    expect(deliveries.find((item) => item.message.id === messageIdOf('exempt'))?.lastErrorCode).not.toBe(
      'capped'
    );
  }, 120_000);
});
