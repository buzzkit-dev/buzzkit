import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type WorkflowBody = {
  status: string;
  current: { number: number; publishedAt: string | null } | null;
  draft: { number: number } | null;
  versions?: Array<{ number: number; publishedAt: string | null }>;
};

const spec = (event: string) => ({
  trigger: { event },
  steps: [{ name: 'hello', send: { title: 'Hello' } }],
});

describe('POST /v1/workflows/:slug/publish', () => {
  it('activates the latest version, keeps the published one current while a newer draft exists, and audits', async () => {
    const { keyBearer, workspace, ownerBearer } = await setupWorkspace();
    const slug = `wf-${uniq()}`;
    await api('/v1/workflows', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Trial', spec: spec('trial.started') }),
    });

    const published = await api<WorkflowBody>(`/v1/workflows/${slug}/publish`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({ status: 'active', current: { number: 1 }, draft: null });
    expect(published.body.data?.current?.publishedAt).not.toBeNull();

    const patched = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ spec: spec('trial.renewed') }),
    });
    expect(patched.body.data).toMatchObject({
      status: 'active',
      current: { number: 1 },
      draft: { number: 2 },
    });

    const again = await api<WorkflowBody>(`/v1/workflows/${slug}/publish`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(again.body.data).toMatchObject({ status: 'active', current: { number: 2 }, draft: null });
    const read = await api<WorkflowBody>(`/v1/workflows/${slug}`, { headers: keyBearer });
    expect(
      read.body.data?.versions?.map((version) => [version.number, version.publishedAt !== null])
    ).toEqual([
      [2, true],
      [1, true],
    ]);

    const audit = await api<{ items: Array<{ event: string; data: { version?: number } }> }>(
      `/v1/workspaces/${workspace.slug}/audit`,
      { headers: ownerBearer }
    );
    const publishes = audit.body.data?.items.filter((item) => item.event === 'workflow.published') ?? [];
    expect(publishes.map((item) => item.data.version).sort()).toEqual([1, 2]);
  });
});
