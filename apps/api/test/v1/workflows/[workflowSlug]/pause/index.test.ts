import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type WorkflowBody = { status: string; current: { number: number } | null };

describe('POST /v1/workflows/:slug/pause', () => {
  it('pauses an active workflow, refuses a draft, and publish resumes it', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `wf-${uniq()}`;
    await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug,
        name: 'Trial',
        spec: { trigger: { event: 'trial.started' }, steps: [{ name: 'hello', send: { title: 'Hello' } }] },
      }),
    });

    const draft = await api(`/v1/workflows/${slug}/pause`, { method: 'POST', headers: keyBearer });
    expect(draft.status).toBe(400);
    expect(draft.body.error?.code).toBe('workflow_not_active');

    await api(`/v1/workflows/${slug}/publish`, { method: 'POST', headers: keyBearer });
    const paused = await api<WorkflowBody>(`/v1/workflows/${slug}/pause`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(paused.body.data).toMatchObject({ status: 'paused', current: { number: 1 } });

    const resumed = await api<WorkflowBody>(`/v1/workflows/${slug}/publish`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(resumed.body.data?.status).toBe('active');
  });
});
