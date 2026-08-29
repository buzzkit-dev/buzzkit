import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../utils/setup';
import { publish, subscribe, track } from '../../../../utils/workflows';

type Run = {
  id: string;
  workflowId: string;
  workflow: string;
  versionId: string;
  externalId: string;
  status: string;
  step: string | null;
  summary: string | null;
  startedAt: string;
  updatedAt: string;
};

type Page = { items: Run[]; hasMore: boolean; nextCursor: string | null };

const RUN_ID = /^\d+-wf_[A-Za-z0-9]+-\d+-\d+$/;

const helloSpec = {
  trigger: { event: 'signup' },
  steps: [
    { name: 'settle', wait: '1h' },
    { name: 'hello', send: { title: 'Hello' } },
  ],
};

describe('GET /v1/workflows/:slug/runs', () => {
  it('lists runs newest first, filters by status, pages by cursor and stays in its tenant', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `hello-${uniq()}`;
    const workflowId = await publish(keyBearer, slug, helloSpec);
    const users = [`run_${uniq()}`, `run_${uniq()}`, `run_${uniq()}`];
    for (const user of users) {
      await subscribe(keyBearer, user);
      await track(keyBearer, user, 'signup');
    }

    const list = (query = '') => api<Page>(`/v1/workflows/${slug}/runs${query}`, { headers: keyBearer });
    const items = await eventually(
      async () => {
        const { body } = await list();
        const found = body.data?.items ?? [];
        return found.length === 3 && found.every((run) => run.status === 'completed') ? found : undefined;
      },
      { label: 'three completed runs', timeoutMs: 60_000, intervalMs: 500 }
    );

    for (const run of items) {
      expect(run.id).toMatch(RUN_ID);
      expect(run).toMatchObject({ workflowId, workflow: slug, status: 'completed', step: 'hello' });
      expect(run.versionId).toMatch(/^wfv_/);
      expect(users).toContain(run.externalId);
      expect(new Date(run.startedAt).toISOString()).toBe(run.startedAt);
      expect(run.updatedAt >= run.startedAt).toBe(true);
    }
    const started = items.map((run) => run.startedAt);
    expect(started).toEqual([...started].sort().reverse());

    expect((await list('?status=completed')).body.data?.items).toHaveLength(3);
    expect((await list('?status=running')).body.data?.items).toEqual([]);
    expect((await list('?status=done')).status).toBe(400);

    const first = await list('?limit=2');
    expect(first.body.data?.items).toHaveLength(2);
    expect(first.body.data?.hasMore).toBe(true);
    const second = await list(`?limit=2&cursor=${encodeURIComponent(first.body.data?.nextCursor ?? '')}`);
    expect(second.body.data?.items).toHaveLength(1);
    expect(second.body.data?.hasMore).toBe(false);
    expect(second.body.data?.nextCursor).toBeNull();
    const ids = [...(first.body.data?.items ?? []), ...(second.body.data?.items ?? [])].map((run) => run.id);
    expect(new Set(ids).size).toBe(3);

    const garbage = await list('?cursor=garbage');
    expect(garbage.status).toBe(400);
    expect(garbage.body.error?.code).toBe('invalid_cursor');

    expect((await api(`/v1/workflows/missing-${uniq()}/runs`, { headers: keyBearer })).status).toBe(404);
    const other = await setupWorkspace({ bare: true });
    expect((await api(`/v1/workflows/${slug}/runs`, { headers: other.keyBearer })).status).toBe(404);
  }, 90_000);
});
