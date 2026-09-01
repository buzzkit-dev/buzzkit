import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';
import { publish } from '../../../../utils/workflows';

type ScheduleBody = { next: Array<{ zone: string; at: string }>; fires: unknown[] };

describe('GET /v1/workflows/:workflowSlug/schedule', () => {
  it('serves upcoming fires for a scheduled workflow', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `daily-${uniq()}`;
    await publish(keyBearer, slug, {
      trigger: { schedule: { daily: '09:00' }, timezone: 'UTC' },
      steps: [{ name: 'hello', send: { title: 'Good morning' } }],
    });

    const { status, body } = await api<ScheduleBody>(`/v1/workflows/${slug}/schedule`, {
      headers: keyBearer,
    });
    expect(status).toBe(200);
    expect(body.data?.next.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(body.data?.next[0]?.at).toMatch(/T09:00:00/);
  });

  it('answers 400 for an event-triggered workflow and 404 for unknown slugs', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `flow-${uniq()}`;
    await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug,
        name: 'Welcome',
        spec: { trigger: { event: 'trial.started' }, steps: [{ name: 'hello', send: { title: 'Hi' } }] },
      }),
    });

    const notScheduled = await api(`/v1/workflows/${slug}/schedule`, { headers: keyBearer });
    expect(notScheduled.status).toBe(400);
    expect(notScheduled.body.error?.code).toBe('not_scheduled');

    const unknown = await api(`/v1/workflows/ghost-${uniq()}/schedule`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
