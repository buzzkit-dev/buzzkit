import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../../../utils/setup';

type Sample = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  externalId: string;
  receivedAt: string;
  data: Record<string, unknown>;
};

type Detail = {
  name: string;
  counts: { last24h: number; last7d: number; last30d: number; total: number };
  subscribers7d: number;
  sources: string[];
  lastAt: string;
  firstAt: string;
  volume: {
    range: string;
    bucketSeconds: number;
    from: string;
    to: string;
    buckets: Array<{ at: string; count: number; subscribers: number }>;
  };
  samples: Sample[];
};

type Headers = Record<string, string>;

function detail(headers: Headers, name: string, query = '') {
  return api<Detail>(`/v1/events/names/${name}${query}`, { headers });
}

async function detailUntil(headers: Headers, name: string, total: number, query = '') {
  return await eventually(
    async () => {
      const { status, body } = await detail(headers, name, query);
      return status === 200 &&
        body.data!.counts.total >= total &&
        body.data!.samples.length >= Math.min(total, 20)
        ? body.data!
        : undefined;
    },
    { label: `detail ${name}`, timeoutMs: 60_000 }
  );
}

describe('GET /v1/events/names/:name', () => {
  let keyBearer: Headers;
  let clientBearer: Headers;

  beforeAll(async () => {
    const base = await setupWorkspace({ bare: true });
    keyBearer = base.keyBearer;
    const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
    clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
  });

  it('answers 404 for a name the tenant has never seen', async () => {
    const { status, body } = await detail(keyBearer, `never.${uniq()}`);
    expect(status).toBe(404);
    expect(body.error?.code).toBe('not_found');
  });

  it('validates the range', async () => {
    for (const range of ['1h', '48h', '7', 'week', '']) {
      const { status, body } = await detail(keyBearer, 'anything', `?range=${range}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('validation');
      expect(body.error?.param).toBe('range');
    }
  });

  it('caps samples at the 20 newest with their full nested data', async () => {
    const name = `samples.${uniq()}`;
    const externalId = `user_${uniq()}`;
    const events = Array.from({ length: 25 }, (_, index) => ({
      externalId,
      name,
      id: `${name}-${index}`,
      data: {
        index,
        items: [
          { sku: `sku-${index}`, qty: index, price: 9.99 },
          { sku: 'other', qty: 0, price: 0 },
        ],
        numbers: [1, 2, 3],
        flags: [true, false],
        nested: { list: [{ deep: { value: index } }], none: null },
      },
    }));
    for (const event of events) {
      await api('/v1/events', { method: 'POST', headers: keyBearer, body: JSON.stringify(event) });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const found = await detailUntil(keyBearer, name, 25);

    expect(found.name).toBe(name);
    expect(found.counts.total).toBe(25);
    expect(found.subscribers7d).toBe(1);
    expect(found.sources).toEqual(['server']);
    expect(found.samples).toHaveLength(20);
    expect(found.samples.map((sample) => sample.data.index)).toEqual(
      Array.from({ length: 20 }, (_, index) => 24 - index)
    );
    expect(found.samples[0]?.data).toEqual(events[24]?.data);
    expect(found.samples[0]?.externalId).toBe(externalId);
    expect(found.samples.every((sample) => sample.name === name && sample.source === 'server')).toBe(true);
    for (let index = 1; index < found.samples.length; index++) {
      expect(new Date(found.samples[index]!.receivedAt).getTime()).toBeLessThanOrEqual(
        new Date(found.samples[index - 1]!.receivedAt).getTime()
      );
    }
  }, 120_000);

  it('buckets the volume per range and lists every source', async () => {
    const name = `volume.${uniq()}`;
    const [a, b] = [`user_${uniq()}`, `user_${uniq()}`];
    const now = Date.now();

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId: a, name },
          { externalId: b, name },
          { externalId: a, name, timestamp: new Date(now - 3 * 24 * 3_600_000).toISOString() },
        ],
      }),
    });
    await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: a, source: 'web', events: [{ name }] }),
    });

    const week = await detailUntil(keyBearer, name, 4);
    expect(week.sources).toEqual(['server', 'web']);
    expect(week.subscribers7d).toBe(2);
    expect(week.volume.range).toBe('7d');
    expect(week.volume.bucketSeconds).toBe(21600);
    expect(week.volume.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
    expect(week.volume.buckets.find((bucket) => bucket.count === 3)?.subscribers).toBe(2);
    expect(week.volume.buckets.find((bucket) => bucket.count === 1)?.subscribers).toBe(1);

    for (const [range, bucketSeconds, hours] of [
      ['24h', 3600, 24],
      ['7d', 21600, 24 * 7],
      ['30d', 86400, 24 * 30],
    ] as const) {
      const { status, body } = await detail(keyBearer, name, `?range=${range}`);
      expect(status).toBe(200);
      const volume = body.data!.volume;
      expect(volume.range).toBe(range);
      expect(volume.bucketSeconds).toBe(bucketSeconds);
      expect(new Date(volume.to).getTime() - new Date(volume.from).getTime()).toBe(hours * 3_600_000);
      expect(volume.buckets.length).toBeGreaterThanOrEqual(1);
      expect(volume.buckets.length).toBeLessThanOrEqual((hours * 3600) / bucketSeconds + 1);
      expect(volume.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(range === '24h' ? 3 : 4);
      for (const bucket of volume.buckets) {
        expect(new Date(bucket.at).getTime() % (bucketSeconds * 1000)).toBe(0);
        expect(new Date(bucket.at).getTime()).toBeLessThanOrEqual(new Date(volume.to).getTime());
        expect(new Date(bucket.at).getTime() + bucketSeconds * 1000).toBeGreaterThan(
          new Date(volume.from).getTime()
        );
      }
      for (let index = 1; index < volume.buckets.length; index++) {
        expect(volume.buckets[index]!.at > volume.buckets[index - 1]!.at).toBe(true);
      }
    }
  }, 90_000);

  it('describes reserved names the engine wrote', async () => {
    const externalId = `user_${uniq()}`;
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'anything' }),
    });

    const created = await eventually(
      async () => {
        const { status, body } = await detail(keyBearer, '$subscriber.created');
        return status === 200 && body.data!.samples.some((sample) => sample.data.externalId === externalId)
          ? body.data!
          : undefined;
      },
      { label: 'subscriber created sample', timeoutMs: 60_000 }
    );
    expect(created.sources).toEqual(['system']);
    expect(created.samples.every((sample) => sample.source === 'system')).toBe(true);
    expect(created.samples[0]?.data).toEqual({ externalId, attributes: {} });
  }, 90_000);

  it('answers 404 for a name only another tenant has seen', async () => {
    const other = await setupWorkspace({ bare: true });
    const name = `elsewhere.${uniq()}`;
    await api('/v1/events', {
      method: 'POST',
      headers: other.keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name }),
    });
    await detailUntil(other.keyBearer, name, 1);

    const { status } = await detail(keyBearer, name);
    expect(status).toBe(404);
  }, 90_000);
});
