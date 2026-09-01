import { execSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';

type Tracked = { id: string; name: string; status: string };
type TrackedList = { items: Tracked[] };
type Listed = { items: { id: string; name: string }[] };
type Catalog = { items: { name: string; counts: { total: number } }[] };

const TINYBIRD_CONTAINER = 'buzzkit-tinybird';

function tinybird(command: 'pause' | 'unpause') {
  execSync(`docker ${command} ${TINYBIRD_CONTAINER}`, { stdio: 'ignore' });
}

describe('event durability', () => {
  afterAll(() => {
    try {
      tinybird('unpause');
    } catch {}
  });

  it('accepts events while Tinybird is down and lands every one of them once it is back', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const name = `outage.${uniq()}`;
    const events = Array.from({ length: 7 }, (_, index) => ({
      id: `${name}:${index}`,
      externalId,
      name,
      data: { index },
    }));

    tinybird('pause');
    let tracked: Tracked[] | undefined;
    try {
      const { status, body } = await api<TrackedList>('/v1/events', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ events }),
      });
      expect(status).toBe(202);
      tracked = body.data?.items;
      expect(tracked?.every((event) => event.status === 'accepted')).toBe(true);

      const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline?limit=50`, {
        headers: keyBearer,
      });
      expect(timeline.body.data?.items.filter((event) => event.name === name)).toHaveLength(7);

      await new Promise((resolve) => setTimeout(resolve, 45_000));
    } finally {
      tinybird('unpause');
    }

    const catalog = await eventually(
      async () => {
        const { body } = await api<Catalog>('/v1/events/names', { headers: keyBearer });
        const entry = body.data?.items.find((item) => item.name === name);
        return entry && entry.counts.total >= 7 ? entry : undefined;
      },
      { timeoutMs: 120_000, label: 'events landing in Tinybird after the outage' }
    );
    expect(catalog.counts.total).toBeGreaterThanOrEqual(7);

    const listed = await api<Listed>(`/v1/events?name=${name}&limit=50`, { headers: keyBearer });
    expect(new Set(listed.body.data?.items.map((event) => event.id)).size).toBe(7);
    expect(listed.body.data?.items.map((event) => event.id).sort()).toEqual(
      tracked!.map((event) => event.id).sort()
    );
  }, 240_000);
});
