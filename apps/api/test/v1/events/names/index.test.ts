import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { createClientKey, createTenant, setupWorkspace, uniq } from '../../../utils/setup';

type CatalogEntry = {
  name: string;
  counts: { last24h: number; last7d: number; last30d: number; total: number };
  subscribers7d: number;
  sources: string[];
  lastAt: string;
  firstAt: string;
};

type Catalog = { items: CatalogEntry[]; hasMore: boolean; nextCursor: string | null };

type Headers = Record<string, string>;

function listNames(headers: Headers) {
  return api<Catalog>('/v1/events/names', { headers });
}

async function catalogEntry(headers: Headers, name: string, total: number) {
  return await eventually(
    async () => {
      const { body } = await listNames(headers);
      const entry = body.data?.items.find((item) => item.name === name);
      return entry && entry.counts.total >= total ? entry : undefined;
    },
    { label: `catalog entry ${name}`, timeoutMs: 120_000 }
  );
}

describe('GET /v1/events/names', () => {
  let keyBearer: Headers;
  let clientBearer: Headers;

  beforeAll(async () => {
    const base = await setupWorkspace({ bare: true });
    keyBearer = base.keyBearer;
    const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
    clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
  });

  it('catalogs every name with consistent counts, distinct subscribers, sorted sources and a time span', async () => {
    const name = `catalog.${uniq()}`;
    const quiet = `quiet.${uniq()}`;
    const [a, b] = [`user_${uniq()}`, `user_${uniq()}`];
    const started = Date.now();

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId: a, name },
          { externalId: a, name },
          { externalId: b, name },
          { externalId: b, name: quiet },
        ],
      }),
    });
    await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: a,
        source: 'ios',
        events: [{ name }, { name, timestamp: new Date(started - 2 * 24 * 3_600_000).toISOString() }],
      }),
    });

    const entry = await catalogEntry(keyBearer, name, 5);
    expect(entry.counts).toEqual({ last24h: 4, last7d: 5, last30d: 5, total: 5 });
    expect(entry.subscribers7d).toBe(2);
    expect(entry.sources).toEqual(['ios', 'server']);
    expect(new Date(entry.firstAt).getTime()).toBeLessThanOrEqual(new Date(entry.lastAt).getTime());
    expect(new Date(entry.firstAt).getTime()).toBeLessThanOrEqual(started - 2 * 24 * 3_600_000);
    expect(new Date(entry.lastAt).getTime()).toBeGreaterThanOrEqual(started - 1000);
    expect(new Date(entry.lastAt).getTime()).toBeLessThanOrEqual(Date.now());

    const single = await catalogEntry(keyBearer, quiet, 1);
    expect(single.counts).toEqual({ last24h: 1, last7d: 1, last30d: 1, total: 1 });
    expect(single.subscribers7d).toBe(1);
    expect(single.sources).toEqual(['server']);

    const created = await catalogEntry(keyBearer, '$subscriber.created', 2);
    expect(created.sources).toEqual(['system']);
    expect(created.subscribers7d).toBe(2);

    const { status, body } = await listNames(keyBearer);
    expect(status).toBe(200);
    expect(body.data?.hasMore).toBe(false);
    expect(body.data?.nextCursor).toBeNull();
    const order = body.data!.items.map((item) => item.name);
    expect(order.indexOf(name)).toBeLessThan(order.indexOf('$subscriber.created'));
    expect(order.indexOf('$subscriber.created')).toBeLessThan(order.indexOf(quiet));
    for (let index = 1; index < body.data!.items.length; index++) {
      expect(body.data!.items[index]!.counts.last7d).toBeLessThanOrEqual(
        body.data!.items[index - 1]!.counts.last7d
      );
    }
  }, 90_000);

  it('returns an empty list for a tenant without events', async () => {
    const { keyBearer: bareKeyBearer } = await setupWorkspace({ bare: true });

    const { status, body } = await listNames(bareKeyBearer);

    expect(status).toBe(200);
    expect(body.data).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it('keeps names per tenant', async () => {
    const base = await setupWorkspace({ bare: true });
    const sibling = await createTenant(base.keyBearer, 'Sibling', { bare: true });
    const siblingBearer = { ...base.keyBearer, 'buzzkit-tenant': sibling.slug };
    const stranger = await setupWorkspace({ bare: true });
    const mine = `mine.${uniq()}`;
    const theirs = `theirs.${uniq()}`;

    await api('/v1/events', {
      method: 'POST',
      headers: base.keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name: mine }),
    });
    await api('/v1/events', {
      method: 'POST',
      headers: siblingBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name: theirs }),
    });
    await catalogEntry(base.keyBearer, mine, 1);
    await catalogEntry(siblingBearer, theirs, 1);

    const defaultNames = (await listNames(base.keyBearer)).body.data!.items.map((item) => item.name);
    expect(defaultNames).toContain(mine);
    expect(defaultNames).not.toContain(theirs);

    const siblingNames = (await listNames(siblingBearer)).body.data!.items.map((item) => item.name);
    expect(siblingNames).toContain(theirs);
    expect(siblingNames).not.toContain(mine);

    const foreign = await listNames(stranger.keyBearer);
    expect(foreign.body.data?.items).toEqual([]);
  }, 90_000);
});
