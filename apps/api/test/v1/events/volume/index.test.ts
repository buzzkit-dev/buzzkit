import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../utils/setup';

type Volume = {
  range: string;
  bucketSeconds: number;
  from: string;
  to: string;
  buckets: Array<{ at: string; count: number; subscribers: number }>;
};

type Headers = Record<string, string>;

function volume(headers: Headers, query = '') {
  return api<Volume>(`/v1/events/volume${query}`, { headers });
}

function total(data: Volume) {
  return data.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

async function volumeUntil(headers: Headers, query: string, count: number) {
  return await eventually(
    async () => {
      const { status, body } = await volume(headers, query);
      return status === 200 && total(body.data!) >= count ? body.data! : undefined;
    },
    { label: `volume ${query}`, timeoutMs: 60_000 }
  );
}

describe('GET /v1/events/volume', () => {
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ keyBearer } = await setupWorkspace({ bare: true }));
  });

  it('validates the range and the name', async () => {
    for (const range of ['1h', '90d', 'all', '']) {
      const { status, body } = await volume(keyBearer, `?range=${range}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('validation');
      expect(body.error?.param).toBe('range');
    }

    const name = await volume(keyBearer, '?name=Not%20A%20Name');
    expect(name.status).toBe(400);
    expect(name.body.error?.code).toBe('validation');
    expect(name.body.error?.param).toBe('name');
  });

  it('defaults to 7d and sizes every range', async () => {
    const fallback = await volume(keyBearer);
    expect(fallback.status).toBe(200);
    expect(fallback.body.data?.range).toBe('7d');
    expect(fallback.body.data?.bucketSeconds).toBe(21600);

    for (const [range, bucketSeconds, hours] of [
      ['24h', 3600, 24],
      ['7d', 21600, 24 * 7],
      ['30d', 86400, 24 * 30],
    ] as const) {
      const { status, body } = await volume(keyBearer, `?range=${range}`);
      expect(status).toBe(200);
      expect(body.data?.range).toBe(range);
      expect(body.data?.bucketSeconds).toBe(bucketSeconds);
      expect(new Date(body.data!.to).getTime() - new Date(body.data!.from).getTime()).toBe(hours * 3_600_000);
      expect(Math.abs(new Date(body.data!.to).getTime() - Date.now())).toBeLessThan(10_000);
    }
  });

  it('counts every event inside the window, optionally for one name', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const name = `volume.${uniq()}`;
    const other = `other.${uniq()}`;
    const [a, b, c] = [`user_${uniq()}`, `user_${uniq()}`, `user_${uniq()}`];
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 3_600_000).toISOString();

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId: a, name },
          { externalId: a, name },
          { externalId: b, name },
          { externalId: b, name, timestamp: threeDaysAgo },
          { externalId: c, name, timestamp: threeDaysAgo },
          { externalId: a, name: other },
          { externalId: c, name: other, timestamp: threeDaysAgo },
        ],
      }),
    });

    const named = await volumeUntil(keyBearer, `?range=7d&name=${name}`, 5);
    expect(total(named)).toBe(5);
    expect(named.buckets.map((bucket) => bucket.subscribers).sort()).toEqual([2, 2]);

    const day = await volume(keyBearer, `?range=24h&name=${name}`);
    expect(total(day.body.data!)).toBe(3);
    expect(
      day.body.data?.buckets.every((bucket) => new Date(bucket.at).getTime() > now - 25 * 3_600_000)
    ).toBe(true);
    expect(day.body.data?.buckets.reduce((sum, bucket) => sum + bucket.subscribers, 0)).toBe(2);

    const month = await volume(keyBearer, `?range=30d&name=${name}`);
    expect(total(month.body.data!)).toBe(5);

    const otherName = await volumeUntil(keyBearer, `?range=7d&name=${other}`, 2);
    expect(total(otherName)).toBe(2);

    const unknown = await volume(keyBearer, `?range=7d&name=never.${uniq()}`);
    expect(unknown.status).toBe(200);
    expect(unknown.body.data?.buckets).toEqual([]);

    const everything = await volumeUntil(keyBearer, '?range=7d', 10);
    expect(total(everything)).toBe(10);
    const everythingToday = await volume(keyBearer, '?range=24h');
    expect(total(everythingToday.body.data!)).toBe(7);

    for (const bucket of everything.buckets) {
      expect(new Date(bucket.at).getTime() % (21600 * 1000)).toBe(0);
      expect(new Date(bucket.at).getTime()).toBeGreaterThanOrEqual(
        new Date(everything.from).getTime() - 21600 * 1000
      );
      expect(new Date(bucket.at).getTime()).toBeLessThanOrEqual(new Date(everything.to).getTime());
    }
  }, 90_000);

  it('never counts another tenant', async () => {
    const other = await setupWorkspace({ bare: true });
    const name = `foreign.${uniq()}`;
    await api('/v1/events', {
      method: 'POST',
      headers: other.keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name }),
    });
    await volumeUntil(other.keyBearer, `?name=${name}`, 1);

    const { status, body } = await volume(keyBearer, `?name=${name}`);
    expect(status).toBe(200);
    expect(body.data?.buckets).toEqual([]);
  }, 90_000);
});
