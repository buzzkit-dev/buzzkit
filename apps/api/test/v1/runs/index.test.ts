import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';
import { publish, subscribe, track } from '../../utils/workflows';

type Run = { id: string; workflow: string; externalId: string; status: string };

type Page = { items: Run[]; hasMore: boolean; nextCursor: string | null };

const spec = (event: string) => ({
  trigger: { event },
  steps: [{ name: 'hold', waitFor: { event: 'never', timeout: '2d' } }],
});

describe('GET /v1/runs', () => {
  it('lists runs across workflows, newest first, filtered by status and scoped to the tenant', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const first = `one-${uniq()}`;
    const second = `two-${uniq()}`;
    await publish(keyBearer, first, spec('one.started'));
    await publish(keyBearer, second, spec('two.started'));
    const user = `run_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'one.started');
    await track(keyBearer, user, 'two.started');

    const items = await eventually(
      async () => {
        const { body } = await api<Page>('/v1/runs', { headers: keyBearer });
        const found = body.data?.items ?? [];
        return found.length === 2 ? found : undefined;
      },
      { label: 'two runs listed', timeoutMs: 120_000, intervalMs: 500 }
    );
    expect(items.map((run) => run.workflow).sort()).toEqual([first, second].sort());
    expect(items.every((run) => run.status === 'waiting' && run.externalId === user)).toBe(true);

    const waiting = await api<Page>('/v1/runs?status=waiting', { headers: keyBearer });
    expect(waiting.body.data?.items).toHaveLength(2);
    const completed = await api<Page>('/v1/runs?status=completed', { headers: keyBearer });
    expect(completed.body.data?.items).toEqual([]);
    const one = await api<Page>(`/v1/runs?workflow=${first}`, { headers: keyBearer });
    expect(one.body.data?.items.map((run) => run.workflow)).toEqual([first]);
    expect((await api(`/v1/runs?workflow=missing-${uniq()}`, { headers: keyBearer })).status).toBe(404);

    const other = await setupWorkspace({ bare: true });
    const foreign = await api<Page>('/v1/runs', { headers: other.keyBearer });
    expect(foreign.body.data?.items).toEqual([]);
  }, 90_000);
});
