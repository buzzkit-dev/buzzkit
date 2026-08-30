import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../utils/setup';
import { publish, runEvents, subscribe, track } from '../../../utils/workflows';

type RunEvent = {
  name: string;
  step: string | null;
  data: Record<string, unknown>;
  externalId: string | null;
};

type Run = {
  id: string;
  workflow: string;
  externalId: string;
  status: string;
  step: string | null;
  summary: string | null;
  startedAt: string;
  events: RunEvent[];
};

const holdSpec = {
  trigger: { event: 'order.placed' },
  steps: [
    { name: 'hold', waitFor: { event: 'order.paid', timeout: '2d' } },
    { name: 'thanks', send: { title: 'Thanks' } },
  ],
};

describe('GET /v1/runs/:id', () => {
  it('reads a live run from the actor, then the finished run with every event, and hides other tenants', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `hold-${uniq()}`;
    await publish(keyBearer, slug, holdSpec);
    const user = `run_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'order.placed');

    const started = await eventually(
      async () => (await runEvents(keyBearer, user)).find((item) => item.name === '$run.started'),
      { label: 'run started', timeoutMs: 30_000, intervalMs: 300 }
    );
    const runId = String(started.data.runId);

    const read = () => api<Run>(`/v1/runs/${runId}`, { headers: keyBearer });
    const waiting = await eventually(
      async () => {
        const { body } = await read();
        return body.data?.status === 'waiting' ? body.data : undefined;
      },
      { label: 'run waiting on the actor', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(waiting).toMatchObject({ id: runId, workflow: slug, externalId: user, step: 'hold' });
    expect(waiting.events.map((event) => `${event.name}:${event.step ?? ''}`)).toEqual([
      '$run.started:',
      '$run.step:hold',
    ]);
    expect(waiting.events[0]?.externalId).toBe(user);

    await track(keyBearer, user, 'order.paid');
    const done = await eventually(
      async () => {
        const { body } = await read();
        return body.data?.status === 'completed' ? body.data : undefined;
      },
      { label: 'run completed', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(done.step).toBe('thanks');
    expect(
      done.events.map((event) => `${event.name}:${event.step ?? ''}:${event.data.status ?? ''}`)
    ).toEqual([
      '$run.started::',
      '$run.step:hold:waiting',
      '$run.step:hold:completed',
      '$run.step:thanks:completed',
      '$run.completed:thanks:',
    ]);

    await eventually(
      async () => {
        const { body } = await api<{ items: Run[] }>(`/v1/workflows/${slug}/runs`, { headers: keyBearer });
        return body.data?.items[0]?.status === 'completed';
      },
      { label: 'run stored', timeoutMs: 30_000, intervalMs: 500 }
    );

    expect((await api('/v1/runs/nope', { headers: keyBearer })).status).toBe(404);
    const other = await setupWorkspace({ bare: true });
    expect((await api(`/v1/runs/${runId}`, { headers: other.keyBearer })).status).toBe(404);
  }, 90_000);
});
