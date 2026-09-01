import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type Run = { id: string; status: string };

const reminder = {
  trigger: { event: 'workout.missed' },
  steps: [
    { name: 'window', waitUntil: { delay: '24h' } },
    { name: 'remind', send: { title: 'Time to move', body: 'Keep the streak.', deliver: 'local' } },
  ],
};

async function liveRunId(headers: Headers, externalId: string): Promise<string> {
  return await eventually(
    async () => {
      const { body } = await api<{ items: Run[] }>(`/v1/subscribers/${externalId}/runs`, { headers });
      return body.data?.items[0]?.id;
    },
    { label: 'live run visible', timeoutMs: 10_000, intervalMs: 200 }
  );
}

describe('local delivery acknowledgment', () => {
  it('sends the message as a push when no device confirmed the schedule', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `silent_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `local-fb-${uniq()}`, reminder);

    await track(keyBearer, user, 'workout.missed');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed', timeoutMs: 60_000, intervalMs: 500 }
    );

    const events = await runEvents(keyBearer, user);
    const fallback = events.find(
      (item) =>
        item.data.step === 'remind' &&
        item.data.summary === 'No device confirmed the local schedule; sent as a push instead'
    );
    expect(fallback).toBeDefined();

    const { body } = await api<{ items: { id: string }[] }>(`/v1/subscribers/${user}/deliveries`, {
      headers: keyBearer,
    });
    expect((body.data?.items ?? []).length).toBeGreaterThan(0);
  }, 120_000);

  it('keeps the delivery local when the device acknowledged with $local.scheduled', async () => {
    const base = await setupWorkspace({ push: 'unusable' });
    const { keyBearer } = base;
    const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
    const clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
    const user = `acked_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `local-ack-${uniq()}`, reminder);

    await track(keyBearer, user, 'workout.missed');
    const runId = await liveRunId(keyBearer, user);

    const acked = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: user,
        source: 'ios',
        events: [{ id: uniq(), name: '$local.scheduled', data: { localId: `${runId}:remind` } }],
      }),
    });
    expect(acked.status).toBe(202);

    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed', timeoutMs: 60_000, intervalMs: 500 }
    );

    const events = await runEvents(keyBearer, user);
    const summaries = events.map((item) => item.data.summary);
    expect(summaries).toContain('Scheduled “Time to move” on the device');
    expect(summaries).not.toContain('No device confirmed the local schedule; sent as a push instead');
  }, 120_000);
});
