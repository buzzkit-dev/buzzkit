import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { subscribe, track } from '../../utils/workflows';

type Headers = Record<string, string>;
type RunEvent = { name: string; data: Record<string, unknown> };

async function publish(headers: Headers, slug: string, spec: Record<string, unknown>) {
  const created = await api('/v1/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: slug, spec }),
  });
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const published = await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers });
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
}

async function runEvents(headers: Headers, externalId: string): Promise<RunEvent[]> {
  const { body } = await api<{ items: RunEvent[] }>(`/v1/subscribers/${externalId}/timeline?limit=100`, {
    headers,
  });
  return (body.data?.items ?? []).filter((item) => item.name.startsWith('$run.')).reverse();
}

describe('E9 live paths', () => {
  it('ends a multi-event wait through endOn and continues the run unmatched', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `decider_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `decide-${uniq()}`, {
      trigger: { event: 'trial.started' },
      steps: [
        {
          name: 'decision',
          waitFor: {
            events: [{ event: 'subscription.started' }, { event: 'trial.extended' }],
            endOn: [{ event: 'account.deleted' }],
            timeout: '2d',
          },
        },
        {
          name: 'gate',
          branch: [
            {
              name: 'won',
              when: { ref: 'steps.decision.matched', eq: true },
              steps: [{ name: 'thanks', send: { title: 'Welcome' } }],
            },
            { name: 'else', steps: [{ name: 'note', set: { var: 'ended', value: true } }] },
          ],
        },
      ],
    });

    await track(keyBearer, user, 'trial.started');
    await eventually(
      async () =>
        (await runEvents(keyBearer, user)).some(
          (item) => item.data.step === 'decision' && item.data.status === 'waiting'
        ),
      { label: 'decision waiting', timeoutMs: 30_000, intervalMs: 300 }
    );

    await track(keyBearer, user, 'account.deleted');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed after endOn', timeoutMs: 60_000, intervalMs: 500 }
    );

    const events = await runEvents(keyBearer, user);
    const decision = events.find((item) => item.data.step === 'decision' && item.data.status === 'completed');
    expect(decision?.data.summary).toBe('Ended by account.deleted');
    const gate = events.find((item) => item.data.step === 'note' && item.data.status === 'completed');
    expect(gate).toBeDefined();
  }, 120_000);

  it('wins a multi-event wait with the second event and records which one', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `winner_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `win-${uniq()}`, {
      trigger: { event: 'trial.started' },
      steps: [
        {
          name: 'decision',
          waitFor: {
            events: [{ event: 'subscription.started' }, { event: 'trial.extended' }],
            timeout: '2d',
          },
        },
        { name: 'record', set: { var: 'done', value: true } },
      ],
    });

    await track(keyBearer, user, 'trial.started');
    await eventually(
      async () =>
        (await runEvents(keyBearer, user)).some(
          (item) => item.data.step === 'decision' && item.data.status === 'waiting'
        ),
      { label: 'decision waiting', timeoutMs: 30_000, intervalMs: 300 }
    );
    await track(keyBearer, user, 'trial.extended');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'run completed after match', timeoutMs: 60_000, intervalMs: 500 }
    );
    const events = await runEvents(keyBearer, user);
    const decision = events.find((item) => item.data.step === 'decision' && item.data.status === 'completed');
    expect(decision?.data.summary).toBe('Received trial.extended');
  }, 120_000);

  it('runs a live repeat to its cap with unique durable step names', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const user = `looper_${uniq()}`;
    await subscribe(keyBearer, user);
    await publish(keyBearer, `loop-${uniq()}`, {
      trigger: { event: 'go' },
      steps: [
        {
          name: 'loop',
          repeat: {
            every: '6h',
            max: 3,
            steps: [{ name: 'mark', set: { var: 'passes', value: true } }],
          },
        },
        { name: 'after', set: { var: 'done', value: true } },
      ],
    });

    await track(keyBearer, user, 'go');
    await eventually(
      async () => (await runEvents(keyBearer, user)).some((item) => item.name === '$run.completed'),
      { label: 'looped run completed', timeoutMs: 90_000, intervalMs: 500 }
    );
    const events = await runEvents(keyBearer, user);
    const marks = events.filter((item) => item.data.step === 'mark' && item.data.status === 'completed');
    expect(marks).toHaveLength(3);
    const loopDone = events.find((item) => item.data.step === 'loop' && item.data.status === 'completed');
    expect(loopDone?.data.summary).toBe('Stopped at the 3-pass cap');
  }, 150_000);
});
