import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { createClientKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function timelineNames(headers: Record<string, string>, externalId: string, atLeast: number) {
  return await eventually(
    async () => {
      const { body } = await api<{ items: Array<{ name: string }> }>(
        `/v1/subscribers/${encodeURIComponent(externalId)}/timeline`,
        { headers }
      );
      const names = body.data?.items.map((item) => item.name) ?? [];
      return names.length >= atLeast ? names : undefined;
    },
    { label: `timeline of ${externalId}` }
  );
}

async function identify(headers: Record<string, string>, externalId: string, attributes?: object) {
  return api<{ id: string; externalId: string; attributes: Record<string, unknown> }>(
    `/v1/subscribers/${encodeURIComponent(externalId)}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(attributes === undefined ? {} : { attributes }),
    }
  );
}

describe('system attributes', () => {
  async function setupDevice() {
    const { workspace, owner, keyBearer } = await setupWorkspace();
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    return { workspace, keyBearer, clientBearer: { Authorization: `Bearer ${clientKey.token}` } };
  }
  const device = { 'cf-ipcountry': 'DE', 'accept-language': 'de-DE,de;q=0.9' };
  type Attributes = Record<string, unknown>;

  it('are stamped when the device identifies, and only as $-keys', async () => {
    const { clientBearer } = await setupDevice();
    const externalId = `sys-${uniq()}`;

    const identified = await api<{ attributes: Attributes }>('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });
    expect(identified.status).toBe(201);
    expect(identified.body.data?.attributes.$language).toBe('de-DE');
    expect(typeof identified.body.data?.attributes.$country).toBe('string');
    expect(Object.keys(identified.body.data?.attributes ?? {}).every((key) => key.startsWith('$'))).toBe(
      true
    );
  });

  it('are stamped when the device registers a subscription, creating the subscriber implicitly', async () => {
    const { clientBearer, keyBearer } = await setupDevice();
    const externalId = `dev-${uniq()}`;

    const registered = await api('/v1/client/subscriptions', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: `tok-${uniq()}` }),
    });
    expect(registered.status).toBe(201);

    const fetched = await api<{ attributes: Attributes }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}`,
      {
        headers: keyBearer,
      }
    );
    expect(fetched.body.data?.attributes.$language).toBe('de-DE');
  });

  it('refresh on every device call, newest wins, without touching custom keys', async () => {
    const { clientBearer, keyBearer } = await setupDevice();
    const externalId = `fresh-${uniq()}`;

    await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });
    await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'pro' } }),
    });
    const again = await api<{ attributes: Attributes }>('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, 'accept-language': 'fr-FR' },
      body: JSON.stringify({ externalId }),
    });
    expect(again.status).toBe(200);
    expect(again.body.data?.attributes.$language).toBe('fr-FR');
    expect(again.body.data?.attributes.plan).toBe('pro');
  });

  it('survive a wholesale server-side replace of the custom attributes', async () => {
    const { clientBearer, keyBearer } = await setupDevice();
    const externalId = `keep-${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });

    const replaced = await api<{ attributes: Attributes }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}`,
      {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ attributes: { plan: 'pro' } }),
      }
    );
    expect(replaced.status).toBe(200);
    expect(replaced.body.data?.attributes).toMatchObject({ plan: 'pro', $language: 'de-DE' });

    const emptied = await api<{ attributes: Attributes }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}`,
      {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ attributes: {} }),
      }
    );
    expect(emptied.body.data?.attributes.plan).toBeUndefined();
    expect(emptied.body.data?.attributes.$language).toBe('de-DE');

    const untouched = await api<{ attributes: Attributes }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}`,
      {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ email: `${externalId}@example.com` }),
      }
    );
    expect(untouched.body.data?.attributes.$language).toBe('de-DE');
  });

  it('are never stamped by server-side identify, whatever headers the backend sends', async () => {
    const { keyBearer } = await setupDevice();
    const externalId = `srv-${uniq()}`;

    const created = await api<{ attributes: Attributes }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}`,
      {
        method: 'PUT',
        headers: { ...keyBearer, ...device },
        body: JSON.stringify({ attributes: { plan: 'free' } }),
      }
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.attributes).toEqual({ plan: 'free' });
  });

  it('cannot be written by hand, on create or on update', async () => {
    const { keyBearer } = await setupDevice();
    const externalId = `forge-${uniq()}`;

    for (const attributes of [{ $country: 'US' }, { plan: 'pro', $language: 'en' }, { $custom: 1 }]) {
      const forged = await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ attributes }),
      });
      expect(forged.status, JSON.stringify(attributes)).toBe(400);
      expect(forged.body.error?.code).toBe('system_attribute');
      expect(forged.body.error?.param).toBe('attributes');
    }

    const missing = await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, { headers: keyBearer });
    expect(missing.status).toBe(404);
  });

  it('do not churn the row when nothing changed', async () => {
    const { clientBearer, keyBearer } = await setupDevice();
    const externalId = `calm-${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });
    const before = await api<{ updatedAt: string }>(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
      headers: keyBearer,
    });
    await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });
    const after = await api<{ updatedAt: string }>(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
      headers: keyBearer,
    });
    expect(after.body.data?.updatedAt).toBe(before.body.data?.updatedAt);
  });

  it('show up in the list and the detail alike', async () => {
    const { clientBearer, keyBearer } = await setupDevice();
    const externalId = `seen-${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, ...device },
      body: JSON.stringify({ externalId }),
    });

    const list = await api<{ items: Array<{ externalId: string; attributes: Attributes }> }>(
      '/v1/subscribers',
      {
        headers: keyBearer,
      }
    );
    expect(list.body.data?.items.find((item) => item.externalId === externalId)?.attributes.$language).toBe(
      'de-DE'
    );
  });

  it('lists lastSeenAt and platforms per subscriber', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `seen-${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: `tok-${uniq()}` }),
    });
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'android', token: `tok-${uniq()}` }),
    });
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'email', address: `${externalId}@example.com` }),
    });

    const list = await api<{
      items: Array<{
        externalId: string;
        lastSeenAt: string | null;
        channels: string[];
        platforms: string[];
      }>;
      total: number;
    }>('/v1/subscribers', { headers: keyBearer });
    expect(list.body.data?.total).toBe(1);
    const item = list.body.data?.items.find((entry) => entry.externalId === externalId);
    expect(item?.lastSeenAt).toBeTruthy();
    expect([...(item?.platforms ?? [])].sort()).toEqual(['android', 'ios']);
    expect([...(item?.channels ?? [])].sort()).toEqual(['email', 'push']);
  });
});

describe('PUT /v1/subscribers/:externalId', () => {
  it('creates on first call (201) and upserts after (200)', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const first = await identify(keyBearer, externalId, { plan: 'free' });
    expect(first.status).toBe(201);
    expect(first.body.data?.id).toMatch(/^sub_/);
    expect(first.body.data?.id.length).toBeGreaterThanOrEqual(36);
    expect(first.body.data?.externalId).toBe(externalId);
    expect(first.body.data?.attributes).toEqual({ plan: 'free' });

    const second = await identify(keyBearer, externalId, { plan: 'pro' });
    expect(second.status).toBe(200);
    expect(second.body.data?.id).toBe(first.body.data?.id);
    expect(second.body.data?.attributes).toEqual({ plan: 'pro' });
  });

  it('keeps attributes untouched when the body omits them', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { plan: 'free', city: 'berlin' });
    const noop = await identify(keyBearer, externalId);

    expect(noop.status).toBe(200);
    expect(noop.body.data?.attributes).toEqual({ plan: 'free', city: 'berlin' });
  });

  it('an identical identify writes nothing and records no event; a change does both', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const first = await identify(keyBearer, externalId, { plan: 'free', tags: ['a', 'b'], nested: { x: 1 } });
    const _sqid = first.body.data!.id.replace(/^sub_/, '');
    const [before] = await db
      .select({ updatedAt: tables.subscriber.updatedAt })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));

    const same = await identify(keyBearer, externalId, { nested: { x: 1 }, tags: ['a', 'b'], plan: 'free' });
    expect(same.status).toBe(200);
    const omitted = await identify(keyBearer, externalId);
    expect(omitted.status).toBe(200);

    const [after] = await db
      .select({ updatedAt: tables.subscriber.updatedAt })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());

    const timelineBefore = await timelineNames(keyBearer, externalId, 1);
    expect(timelineBefore).toEqual(['$subscriber.created']);

    const changed = await identify(keyBearer, externalId, {
      plan: 'pro',
      tags: ['a', 'b'],
      nested: { x: 1 },
    });
    expect(changed.status).toBe(200);
    const [afterChange] = await db
      .select({ updatedAt: tables.subscriber.updatedAt })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    expect(afterChange?.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());

    const timelineAfter = await timelineNames(keyBearer, externalId, 2);
    expect(timelineAfter).toEqual(['$subscriber.updated', '$subscriber.created']);
  });

  it('concurrent first identifies create exactly one subscriber and one created event', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const results = await Promise.all(
      Array.from({ length: 6 }, () => identify(keyBearer, externalId, { plan: 'free' }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(new Set(results.map((r) => r.body.data?.id)).size).toBe(1);

    const rows = await db
      .select({ id: tables.subscriber.id })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    expect(rows).toHaveLength(1);

    const names = await timelineNames(keyBearer, externalId, 1);
    expect(names.filter((name) => name === '$subscriber.created')).toHaveLength(1);
  });

  it('email on identify creates an email subscription', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const address = `jane-${uniq()}@acme.com`;

    const withEmail = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: address }),
    });
    expect(withEmail.status).toBe(201);

    const detail = await api<{ subscriptions: Array<{ channel: string; endpoint: string }> }>(
      `/v1/subscribers/${externalId}`,
      { headers: keyBearer }
    );
    expect(detail.body.data?.subscriptions).toHaveLength(1);
    expect(detail.body.data?.subscriptions[0]).toMatchObject({ channel: 'email', endpoint: address });

    const invalid = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('caps attributes at 64KB', async () => {
    const { keyBearer } = await setupWorkspace();

    const fine = await identify(keyBearer, `user_${uniq()}`, { blob: 'x'.repeat(60_000) });
    expect(fine.status).toBe(201);

    const tooBig = await identify(keyBearer, `user_${uniq()}`, { blob: 'x'.repeat(70_000) });
    expect(tooBig.status).toBe(400);
  });

  it('re-identifying after deletion creates a fresh subscriber', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const first = await identify(keyBearer, externalId, { plan: 'pro' });
    await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer });
    const second = await identify(keyBearer, externalId);

    expect(second.status).toBe(201);
    expect(second.body.data?.id).not.toBe(first.body.data?.id);
    expect(second.body.data?.attributes).toEqual({});
  });

  it('never sqid-transforms user attributes, even id-looking ones', async () => {
    const { keyBearer } = await setupWorkspace();

    const { body } = await identify(keyBearer, `user_${uniq()}`, { orderId: 12345, nested: { userId: 7 } });

    expect(body.data?.attributes).toEqual({ orderId: 12345, nested: { userId: 7 } });
  });
});

describe('externalId handling', () => {
  it('accepts email-like, unicode, and spaced ids via URL encoding', async () => {
    const { keyBearer } = await setupWorkspace();

    for (const externalId of [
      `jane+${uniq()}@acme.com`,
      `üser-${uniq()}-日本`,
      `has space ${uniq()}`,
      `a/b/${uniq()}`,
    ]) {
      const created = await identify(keyBearer, externalId);
      expect(created.status, externalId).toBe(201);
      expect(created.body.data?.externalId).toBe(externalId);

      const fetched = await api<{ externalId: string }>(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
        headers: keyBearer,
      });
      expect(fetched.status, externalId).toBe(200);
      expect(fetched.body.data?.externalId).toBe(externalId);
    }
  });

  it('rejects over-long ids and 404s consistently for unknown subscribers', async () => {
    const { keyBearer } = await setupWorkspace();

    const tooLong = await identify(keyBearer, 'x'.repeat(257));
    expect(tooLong.status).toBe(400);

    const ghost = `ghost_${uniq()}`;
    const get = await api(`/v1/subscribers/${ghost}`, { headers: keyBearer });
    const del = await api(`/v1/subscribers/${ghost}`, { method: 'DELETE', headers: keyBearer });
    const prefs = await api(`/v1/subscribers/${ghost}/preferences`, { headers: keyBearer });
    const subs = await api(`/v1/subscribers/${ghost}/subscriptions`, { headers: keyBearer });
    expect([get.status, del.status, prefs.status, subs.status]).toEqual([404, 404, 404, 404]);
  });
});

describe('GET /v1/subscribers', () => {
  it('rejects garbage cursors and bad limits', async () => {
    const { keyBearer } = await setupWorkspace();

    const badCursor = await api('/v1/subscribers?cursor=nope!', { headers: keyBearer });
    expect(badCursor.status).toBe(400);

    const badLimit = await api('/v1/subscribers?limit=0', { headers: keyBearer });
    expect(badLimit.status).toBe(400);

    const tenantCursor = await setupWorkspace();
    const foreignEntity = await createTenant(tenantCursor.keyBearer);
    const wrongEntity = await api(`/v1/subscribers?cursor=${foreignEntity.id}`, { headers: keyBearer });
    expect(wrongEntity.status).toBe(400);
  });

  it('lists with keyset pagination', async () => {
    const { keyBearer } = await setupWorkspace();
    for (let i = 0; i < 3; i++) {
      await identify(keyBearer, `user_${uniq()}`);
    }

    const page1 = await api<{ items: Array<{ id: string }>; hasMore: boolean; nextCursor: string }>(
      '/v1/subscribers?limit=2',
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.hasMore).toBe(true);

    const page2 = await api<{ items: Array<{ id: string }>; hasMore: boolean }>(
      `/v1/subscribers?limit=2&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items).toHaveLength(1);
    expect(page2.body.data?.hasMore).toBe(false);
  });
});

describe('subscriber lifecycle & isolation', () => {
  it('GET returns the subscriber with subscriptions; DELETE cascades to them', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const token = `apns-token-${uniq()}${'0'.repeat(40)}`;

    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token }),
    });

    const detail = await api<{ externalId: string; subscriptions: Array<{ id: string }> }>(
      `/v1/subscribers/${externalId}`,
      { headers: keyBearer }
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data?.subscriptions).toHaveLength(1);
    expect(detail.body.data?.subscriptions[0]?.id).toMatch(/^sbn_/);

    const del = await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer });
    expect(del.status).toBe(200);

    const gone = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(gone.status).toBe(404);

    const reregister = await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token }),
    });
    expect(reregister.status).toBe(201);
  });

  it('scopes subscribers to their tenant — same externalId, different tenants, different subscribers', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const externalId = `user_${uniq()}`;

    const inDefault = await identify(keyBearer, externalId);
    const inTenant = await identify({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, externalId);

    expect(inDefault.status).toBe(201);
    expect(inTenant.status).toBe(201);
    expect(inDefault.body.data?.id).not.toBe(inTenant.body.data?.id);

    const foreign = await setupWorkspace();
    const crossWorkspace = await api(`/v1/subscribers/${externalId}`, { headers: foreign.keyBearer });
    expect(crossWorkspace.status).toBe(404);
  });
});

describe('cross-tenant and email-only updates', () => {
  it('a subscriber cannot be deleted through another tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const externalId = `user_${uniq()}`;
    await identify(keyBearer, externalId, { plan: 'free' });

    const foreign = await api(`/v1/subscribers/${externalId}`, {
      method: 'DELETE',
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(foreign.status).toBe(404);
    expect((await api(`/v1/subscribers/${externalId}`, { headers: keyBearer })).status).toBe(200);
  });

  it('a PUT that adds an email updates metadata and registers a subscription only once', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const first = await identify(keyBearer, externalId, { plan: 'free' });
    const _sqid = first.body.data!.id.replace(/^sub_/, '');
    const address = `${externalId}@acme.com`;

    const withEmail = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'free' }, email: address }),
    });
    expect(withEmail.status).toBe(200);
    expect(withEmail.body.data?.attributes).toEqual({ plan: 'free', email: address });
    const names = await timelineNames(keyBearer, externalId, 3);
    expect(names).toContain('$subscription.registered');
    expect(names).toContain('$subscriber.updated');

    const [before] = await db
      .select({ updatedAt: tables.subscriber.updatedAt })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    const repeat = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'free' }, email: address }),
    });
    expect(repeat.status).toBe(200);
    const [after] = await db
      .select({ updatedAt: tables.subscriber.updatedAt })
      .from(tables.subscriber)
      .where(eq(tables.subscriber.externalId, externalId));
    expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
    const namesAfter = await timelineNames(keyBearer, externalId, 3);
    expect(namesAfter.filter((name) => name.startsWith('$subscriber.')).sort()).toEqual([
      '$subscriber.created',
      '$subscriber.updated',
    ]);
  });
});

describe('PUT /v1/subscribers/:externalId timezone', () => {
  it('stores a backend-supplied timezone as $timezone, keeps it across attribute replaces, refuses junk', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `tz_${uniq()}`;
    const put = (body: Record<string, unknown>) =>
      api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify(body),
      });

    const created = await put({ attributes: { plan: 'pro' }, timezone: 'Europe/Berlin' });
    expect(created.status).toBe(201);
    expect(created.body.data?.attributes).toEqual({ plan: 'pro', $timezone: 'Europe/Berlin' });

    const replaced = await put({ attributes: { plan: 'free' } });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data?.attributes).toEqual({ plan: 'free', $timezone: 'Europe/Berlin' });

    const moved = await put({ timezone: 'America/New_York' });
    expect(moved.body.data?.attributes).toEqual({ plan: 'free', $timezone: 'America/New_York' });

    const junk = await put({ timezone: 'Mars/Olympus' });
    expect(junk.status).toBe(400);
    expect(junk.body.error?.code).toBe('invalid_timezone');
    expect(junk.body.error?.param).toBe('timezone');
  });
});

describe('search', () => {
  it('narrows the list to external ids starting with the text or names at a word start', async () => {
    const { keyBearer } = await setupWorkspace();
    const stem = uniq();
    await identify(keyBearer, `${stem}_anna`, { name: 'Anna Schmidt' });
    await identify(keyBearer, `${stem}_max`, { name: 'Max Andersen' });
    await identify(keyBearer, `${stem}_tanaka`, { name: 'Sofia Tanaka' });
    const ids = async (search: string) => {
      const { status, body } = await api<{ items: Array<{ externalId: string }> }>(
        `/v1/subscribers?search=${encodeURIComponent(search)}`,
        { headers: keyBearer }
      );
      expect(status).toBe(200);
      return (body.data?.items ?? []).map((item) => item.externalId).filter((id) => id.startsWith(stem));
    };
    expect(await ids(`${stem}_an`)).toEqual([`${stem}_anna`]);
    expect((await ids('an')).sort()).toEqual([`${stem}_anna`, `${stem}_max`].sort());
    expect(await ids('tanaka')).toEqual([`${stem}_tanaka`]);
    expect(await ids('%')).toEqual([]);
  });
});
