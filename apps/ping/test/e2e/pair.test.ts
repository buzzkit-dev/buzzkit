import { describe, expect, it } from 'vitest';
import type { Claimed, Minted, Rotated } from '../utils/api';
import { call, nextAddress, pair, ping, readJson, snapshot } from '../utils/api';

describe('pairing', () => {
  it('mints a key, an endpoint and the buzzkit identity', async () => {
    const pairing = await pair();

    expect(pairing.key).toMatch(/^bz_[023456789abcdefghjkmnpqrstuvwxyz]{24}$/);
    expect(pairing.endpoint).toBe(`${pairing.endpoint.split('/bz_')[0]}/${pairing.key}`);
    expect(pairing.buzzkit.externalId).toMatch(/^buzz_/);
    expect(pairing.buzzkit.identityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pairing.buzzkit.publishableKey).toMatch(/^bk_pk_/);
  });

  it('mints a different key every time', async () => {
    const [first, second] = await Promise.all([pair(), pair()]);

    expect(first.key).not.toBe(second.key);
    expect(first.buzzkit.externalId).not.toBe(second.buzzkit.externalId);
  });

  it('never exposes the identity again after pairing', async () => {
    const pairing = await pair();
    const state = await snapshot(pairing.key);

    expect(JSON.stringify(state)).not.toContain(pairing.buzzkit.identityHash);
    expect(JSON.stringify(state)).not.toContain(pairing.buzzkit.publishableKey);
  });

  it('rate limits pairing per client address', async () => {
    const address = nextAddress();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await call('/pair', { method: 'POST', address })).status);
    }

    expect(statuses.filter((status) => status === 201).length).toBeLessThanOrEqual(3);
    expect(statuses).toContain(429);
  });

  it('answers a rate limited pair with retry-after', async () => {
    const address = nextAddress();
    let limited: Response | undefined;

    for (let attempt = 0; attempt < 5 && !limited; attempt += 1) {
      const response = await call('/pair', { method: 'POST', address });
      if (response.status === 429) limited = response;
    }

    expect(limited?.headers.get('retry-after')).toBeTruthy();
  });

  it('hands a desktop the key through a six digit code', async () => {
    const pairing = await pair();
    const minted = await readJson<Minted>(await call(`/${pairing.key}/code`, { method: 'POST' }));

    expect(minted.code).toMatch(/^[0-9]{6}$/);

    const claimed = await call('/pair/claim', {
      method: 'POST',
      body: JSON.stringify({ code: minted.code }),
    });
    const body = await readJson<Claimed>(claimed);

    expect(claimed.status).toBe(200);
    expect(body.key).toBe(pairing.key);
    expect(body.mcp).toContain('/mcp');
  });

  it('burns the code after one claim', async () => {
    const pairing = await pair();
    const minted = await readJson<Minted>(await call(`/${pairing.key}/code`, { method: 'POST' }));
    const claim = () => call('/pair/claim', { method: 'POST', body: JSON.stringify({ code: minted.code }) });

    expect((await claim()).status).toBe(200);
    expect((await claim()).status).toBe(404);
  });

  it('refuses a malformed code', async () => {
    const response = await call('/pair/claim', {
      method: 'POST',
      body: JSON.stringify({ code: 'abcdef' }),
    });

    expect(response.status).toBe(400);
  });

  it('rotates the key, retires the old one, and wipes the device', async () => {
    const pairing = await pair();
    await ping(pairing.key, { title: 'Tests passed' });
    await ping(pairing.key, { session: 'build', title: 'Building' });

    const rotated = await readJson<Rotated>(await call(`/${pairing.key}/rotate`, { method: 'POST' }));

    expect(rotated.key).not.toBe(pairing.key);
    expect((await call(`/${pairing.key}`)).status).toBe(404);

    const state = await snapshot(rotated.key);
    expect(state.activity.sessions).toHaveLength(0);

    const timeline = await readJson<{ events: unknown[] }>(await call(`/${rotated.key}/timeline`));
    expect(timeline.events).toHaveLength(0);
  });
});
