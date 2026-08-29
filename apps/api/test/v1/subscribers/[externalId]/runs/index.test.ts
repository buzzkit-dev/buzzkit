import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../utils/setup';
import { publish, subscribe, track } from '../../../../utils/workflows';

type Run = { id: string; workflow: string; externalId: string; status: string; step: string | null };

const holdSpec = {
  trigger: { event: 'order.placed' },
  steps: [
    { name: 'hold', waitFor: { event: 'order.paid', until: '2d' } },
    { name: 'thanks', send: { title: 'Thanks' } },
  ],
};

describe('GET /v1/subscribers/:externalId/runs', () => {
  it("lists the subscriber's runs from the actor, newest first", async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const slug = `hold-${uniq()}`;
    await publish(keyBearer, slug, holdSpec);
    const user = `run_${uniq()}`;
    await subscribe(keyBearer, user);
    await track(keyBearer, user, 'order.placed');

    const runs = await eventually(
      async () => {
        const { body } = await api<{ items: Run[] }>(`/v1/subscribers/${user}/runs`, { headers: keyBearer });
        const items = body.data?.items ?? [];
        return items.length === 1 && items[0]?.status === 'waiting' ? items : undefined;
      },
      { label: 'one waiting run', timeoutMs: 30_000, intervalMs: 300 }
    );
    expect(runs[0]).toMatchObject({ workflow: slug, externalId: user, step: 'hold' });
    expect(runs[0]?.id).toMatch(/^\d+-wf_/);

    expect((await api(`/v1/subscribers/missing_${uniq()}/runs`, { headers: keyBearer })).status).toBe(404);
  }, 60_000);
});
