import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type Trace = { step: string; status: string; summary: string; detail: Record<string, unknown> | null };
type DryRun = { outcome: string; path: string[]; steps: Trace[] };

const reminder = {
  trigger: { event: 'workout.missed' },
  cancelOn: [
    { event: 'workout.completed' },
    { event: 'subscription.canceled', where: { ref: 'trigger.data.plan', eq: 'trial' } },
  ],
  steps: [
    { name: 'window', waitUntil: { time: '19:00', timezone: 'subscriber' } },
    { name: 'remind', send: { title: 'Time to move', body: 'Keep the streak.', deliver: 'local' } },
  ],
};

describe('deliver local through the waitUntil fusion', () => {
  it('schedules the local notification when the wait begins, with the wall-clock time and unconditional cancels', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `local-${uniq()}`;
    const created = await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Local reminder', spec: reminder }),
    });
    expect(created.status).toBe(201);

    const { status, body } = await api<DryRun>(`/v1/workflows/${slug}/test`, {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        attributes: { $timezone: 'Europe/Berlin' },
        event: { name: 'workout.missed', data: { plan: 'trial' } },
        at: '2026-09-01T10:00:00Z',
      }),
    });
    expect(status).toBe(200);
    const run = body.data as DryRun;
    expect(run.outcome).toBe('completed');
    expect(run.path).toEqual(['remind', 'window']);

    const send = run.steps.find((entry) => entry.step === 'remind');
    const payload = send?.detail?.payload as Record<string, unknown>;
    expect(payload.deliver).toBe('local');
    const local = payload.local as { id: string; at: string; cancelOn?: string[] };
    expect(local.at).toBe('2026-09-01T19:00:00');
    expect(local.cancelOn).toEqual(['workout.completed']);
    expect(local.id.endsWith(':remind')).toBe(true);

    const window = run.steps.find((entry) => entry.step === 'window' && entry.status === 'completed');
    expect(window).toBeDefined();
  });
});
