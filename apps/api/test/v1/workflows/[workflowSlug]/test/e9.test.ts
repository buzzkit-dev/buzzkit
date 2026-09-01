import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type Trace = { step: string; status: string; summary: string; detail: Record<string, unknown> | null };
type DryRun = {
  outcome: string;
  path: string[];
  steps: Trace[];
  vars: Record<string, unknown>;
  error: string | null;
};

async function draft(headers: Record<string, string>, spec: Record<string, unknown>) {
  const slug = `e9-${uniq()}`;
  const { status, body } = await api('/v1/workflows', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name: 'E9', spec }),
  });
  if (status !== 201) throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  return slug;
}

function run(headers: Record<string, string>, slug: string, input: Record<string, unknown>) {
  return api<DryRun>(`/v1/workflows/${slug}/test`, { method: 'POST', headers, body: JSON.stringify(input) });
}

describe('repeat', () => {
  it('caps the passes, sleeps between them, and reports the cap', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'workout.missed' },
      steps: [
        {
          name: 'loop',
          repeat: {
            every: '1d',
            max: 3,
            until: { occurred: 'workout.completed', since: 'iteration' },
            steps: [{ name: 'nudge', send: { title: 'Keep the streak' } }],
          },
        },
        { name: 'after', set: { var: 'done', value: true } },
      ],
    });

    const { status, body } = await run(keyBearer, slug, {
      attributes: { $timezone: 'UTC' },
      event: { name: 'workout.missed', data: {} },
      at: '2026-09-01T10:00:00Z',
    });
    expect(status).toBe(200);
    const result = body.data as DryRun;
    expect(result.outcome).toBe('completed');
    expect(result.path.filter((step) => step === 'nudge')).toHaveLength(3);
    expect(result.steps.find((entry) => entry.step === 'loop' && entry.status === 'completed')?.summary).toBe(
      'Stopped at the 3-pass cap'
    );
    expect(result.steps.filter((entry) => entry.step === 'loop' && entry.status === 'sleeping')).toHaveLength(
      2
    );
    expect(result.vars.done).toBe(true);
  });
});

describe('forEach', () => {
  it('fans out over a fetched list, caps it, and scopes the item into vars', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'summary.requested' },
      steps: [
        { name: 'load', fetch: { url: 'http://localhost:1/workouts', as: 'workouts' } },
        {
          name: 'fan',
          forEach: {
            items: 'vars.workouts.items',
            as: 'workout',
            max: 2,
            steps: [{ name: 'ping', send: { title: '{{ vars.workout.kind }} recap' } }],
          },
        },
      ],
    });

    const { status, body } = await run(keyBearer, slug, {
      attributes: {},
      event: { name: 'summary.requested', data: {} },
      at: '2026-09-01T10:00:00Z',
      assume: {
        load: { status: 200, data: { items: [{ kind: 'run' }, { kind: 'lift' }, { kind: 'swim' }] } },
      },
    });
    expect(status).toBe(200);
    const result = body.data as DryRun;
    expect(result.outcome).toBe('completed');
    expect(result.path).toContain('ping');
    const fan = result.steps.find((entry) => entry.step === 'fan' && entry.status === 'completed');
    expect(fan?.summary).toBe('Ran for 2 of 3 items (capped at 2)');
    const titles = result.steps
      .filter((entry) => entry.step === 'ping' && entry.status === 'completed')
      .map((entry) => entry.summary);
    expect(titles).toEqual(['Would send “run recap”', 'Would send “lift recap”']);
  });

  it('skips cleanly when the path is not a list', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'go' },
      steps: [
        {
          name: 'fan',
          forEach: {
            items: 'trigger.data.things',
            as: 'thing',
            max: 5,
            steps: [{ name: 'ping', send: { title: 'x' } }],
          },
        },
      ],
    });
    const { body } = await run(keyBearer, slug, {
      attributes: {},
      event: { name: 'go', data: { things: 'not-a-list' } },
      at: '2026-09-01T10:00:00Z',
    });
    const result = body.data as DryRun;
    expect(result.outcome).toBe('completed');
    expect(result.path).toEqual(['fan']);
    expect(result.steps.find((entry) => entry.step === 'fan')?.summary).toBe(
      'Skipped: trigger.data.things is not a list'
    );
  });
});

describe('waitFor extensions', () => {
  it('waits on several events and reports which side ended it', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'trial.started' },
      steps: [
        {
          name: 'decision',
          waitFor: {
            events: [{ event: 'subscription.started' }, { event: 'trial.canceled' }],
            endOn: [{ event: 'account.deleted' }],
            timeout: '7d',
          },
        },
        {
          name: 'gate',
          branch: [
            {
              name: 'won',
              when: { ref: 'steps.decision.matched', eq: true },
              steps: [{ name: 'thanks', send: { title: 'Welcome aboard' } }],
            },
            { name: 'else', steps: [{ name: 'bye', send: { title: 'Sorry to see you go' } }] },
          ],
        },
      ],
    });

    const matchedRun = await run(keyBearer, slug, {
      attributes: {},
      event: { name: 'trial.started', data: {} },
      at: '2026-09-01T10:00:00Z',
      assume: { decision: { matched: true, data: { plan: 'annual' } } },
    });
    const matched = matchedRun.body.data as DryRun;
    expect(matched.outcome).toBe('completed');
    expect(matched.path).toContain('thanks');
    expect(
      matched.steps.find((entry) => entry.step === 'decision' && entry.status === 'waiting')?.summary
    ).toBe('Waiting for subscription.started or trial.canceled');

    const timedOut = await run(keyBearer, slug, {
      attributes: {},
      event: { name: 'trial.started', data: {} },
      at: '2026-09-01T10:00:00Z',
    });
    const missed = timedOut.body.data as DryRun;
    expect(missed.path).toContain('bye');
  });
});

describe('subscriber facets in scope', () => {
  it('branches on channels and topics for a real subscriber', async () => {
    const { keyBearer } = await setupWorkspace();
    const headers = { ...keyBearer, 'buzzkit-tenant': 'default' };
    await api('/v1/topics', {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug: `deals-${uniq()}`.slice(0, 20), name: 'Deals', channels: ['push'] }),
    });
    const externalId = `user_${uniq()}`;
    const { subscribe } = await import('../../../../utils/workflows');
    await subscribe(headers, externalId);

    const slug = await draft(keyBearer, {
      trigger: { event: 'go' },
      steps: [
        {
          name: 'route',
          branch: [
            {
              name: 'push-capable',
              when: { ref: 'subscriber.channels.push', eq: true },
              steps: [{ name: 'push-it', send: { title: 'Push works' } }],
            },
            { name: 'else', steps: [{ name: 'skip-it', set: { var: 'skipped', value: true } }] },
          ],
        },
      ],
    });

    const { status, body } = await run(keyBearer, slug, {
      externalId,
      event: { name: 'go', data: {} },
      at: '2026-09-01T10:00:00Z',
    });
    expect(status).toBe(200);
    const result = body.data as DryRun;
    expect(result.outcome).toBe('completed');
    expect(result.path).toContain('push-it');
  });
});

describe('rich payload passthrough', () => {
  it('renders templates into every new field and would-sends them', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = await draft(keyBearer, {
      trigger: { event: 'invite.sent' },
      steps: [
        {
          name: 'invite',
          send: {
            title: '{{ trigger.data.host }} invited you',
            deepLink: 'app://events/{{ trigger.data.id }}',
            threadId: 'event-{{ trigger.data.id }}',
            interruptionLevel: 'timeSensitive',
            action: { name: 'show_event', data: { id: '{{ trigger.data.id }}' } },
            actions: [{ id: 'accept', title: 'Accept', foreground: true }],
          },
        },
      ],
    });

    const { status, body } = await run(keyBearer, slug, {
      attributes: {},
      event: { name: 'invite.sent', data: { host: 'Ada', id: 'ev9' } },
      at: '2026-09-01T10:00:00Z',
    });
    expect(status).toBe(200);
    const result = body.data as DryRun;
    const step = result.steps.find((entry) => entry.step === 'invite' && entry.status === 'completed');
    expect(step?.summary).toBe('Would send “Ada invited you”');
    const payload = step?.detail?.payload as Record<string, unknown>;
    expect(payload.deepLink).toBe('app://events/ev9');
    expect(payload.threadId).toBe('event-ev9');
    expect(payload.interruptionLevel).toBe('timeSensitive');
    expect((payload.action as { data: { id: string } }).data.id).toBe('ev9');
    expect(payload.actions).toEqual([{ id: 'accept', title: 'Accept', foreground: true }]);
  });
});
