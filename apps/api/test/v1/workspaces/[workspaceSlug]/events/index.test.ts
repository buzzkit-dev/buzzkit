import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { addMember, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type EventItem = {
  id: string;
  event: string;
  actorType: string;
  actorDisplay: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
};

async function listEvents(headers: Record<string, string>, slug: string, query = '') {
  return api<{ items: EventItem[]; hasMore: boolean; nextCursor: string | null }>(
    `/v1/workspaces/${slug}/events${query}`,
    { headers }
  );
}

describe('GET /v1/workspaces/:slug/events', () => {
  it('records every mutation with the right actor', async () => {
    const { owner, workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    await api(`/v1/tenants/${tenant.slug}`, { method: 'DELETE', headers: keyBearer });
    await addMember(owner.token, workspace.slug, 'member');

    const { status, body } = await listEvents(ownerBearer, workspace.slug);
    expect(status).toBe(200);

    const byName = new Map(body.data?.items.map((item) => [item.event, item]));

    const created = byName.get('workspace.created');
    expect(created?.actorType).toBe('member');
    expect(created?.actorDisplay).toBe(owner.email);
    expect(created?.targetId).toMatch(/^ws_/);

    const keyCreated = byName.get('key.created');
    expect(keyCreated?.actorType).toBe('member');
    expect(keyCreated?.targetId).toMatch(/^key_/);

    const tenantCreated = byName.get('tenant.created');
    expect(tenantCreated?.actorType).toBe('key');
    expect(tenantCreated?.actorDisplay).toContain('bk_ws_');
    expect(tenantCreated?.targetId).toMatch(/^tnt_/);

    expect(byName.get('tenant.deleted')).toBeDefined();
    expect(byName.get('invite.created')).toBeDefined();
    expect(byName.get('invite.accepted')).toBeDefined();
  });

  it('tenant-scoped events carry a prefixed tenantId', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const events = await api<{ items: Array<{ event: string; tenantId: string | null; targetId: string }> }>(
      `/v1/workspaces/${workspace.slug}/events?event=tenant.created`,
      { headers: ownerBearer }
    );
    const created = events.body.data?.items.find((i) => i.targetId === tenant.id);
    expect(created?.tenantId).toBe(tenant.id);
  });

  it('filters by event name and actor type', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace();
    await createTenant(keyBearer);
    await createTenant(keyBearer);

    const byEvent = await listEvents(ownerBearer, workspace.slug, '?event=tenant.created');
    expect(byEvent.body.data?.items.length).toBe(2);
    expect(byEvent.body.data?.items.every((item) => item.event === 'tenant.created')).toBe(true);

    const byActor = await listEvents(ownerBearer, workspace.slug, '?actorType=key');
    expect(byActor.body.data?.items.every((item) => item.actorType === 'key')).toBe(true);
  });

  it('searches event names, actors and targets, case-insensitively', async () => {
    const { owner, workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const externalId = `Search_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const byName = await listEvents(ownerBearer, workspace.slug, '?q=TENANT.');
    expect(byName.body.data?.items.length).toBeGreaterThan(0);
    expect(byName.body.data?.items.every((item) => item.event.startsWith('tenant.'))).toBe(true);

    const byActor = await listEvents(ownerBearer, workspace.slug, `?q=${owner.email.toUpperCase()}`);
    expect(byActor.body.data?.items.length).toBeGreaterThan(0);
    expect(byActor.body.data?.items.every((item) => item.actorDisplay === owner.email)).toBe(true);

    const byTarget = await listEvents(ownerBearer, workspace.slug, `?q=${tenant.id}`);
    expect(byTarget.body.data?.items.map((item) => item.event)).toEqual(['tenant.created']);

    const bySubscriber = await listEvents(ownerBearer, workspace.slug, `?q=${externalId.toLowerCase()}`);
    expect(bySubscriber.body.data?.items.map((item) => item.event)).toEqual(['subscriber.created']);

    const nothing = await listEvents(ownerBearer, workspace.slug, `?q=nope_${uniq()}`);
    expect(nothing.body.data?.items).toEqual([]);
  });

  it('limits the list to a time window and reports the filtered total', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const before = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await createTenant(keyBearer);
    await createTenant(keyBearer);

    const since = await api<{ items: EventItem[]; total: number }>(
      `/v1/workspaces/${workspace.slug}/events?from=${encodeURIComponent(before)}&event=tenant.created`,
      { headers: ownerBearer }
    );
    expect(since.body.data?.items).toHaveLength(2);
    expect(since.body.data?.total).toBe(2);

    const until = await api<{ items: EventItem[]; total: number }>(
      `/v1/workspaces/${workspace.slug}/events?to=${encodeURIComponent(before)}&event=tenant.created`,
      { headers: ownerBearer }
    );
    expect(until.body.data?.items).toEqual([]);
    expect(until.body.data?.total).toBe(0);

    const combined = await api<{ items: EventItem[]; total: number }>(
      `/v1/workspaces/${workspace.slug}/events?from=${encodeURIComponent(before)}&actorType=member`,
      { headers: ownerBearer }
    );
    expect(combined.body.data?.items).toEqual([]);

    const malformed = await listEvents(ownerBearer, workspace.slug, '?from=yesterday');
    expect(malformed.status).toBe(400);
  });

  it('paginates newest-first with opaque cursors', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace();
    for (let i = 0; i < 3; i++) {
      await createTenant(keyBearer);
    }

    const page1 = await listEvents(ownerBearer, workspace.slug, '?limit=2');
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.hasMore).toBe(true);

    const page2 = await listEvents(
      ownerBearer,
      workspace.slug,
      `?limit=50&cursor=${page1.body.data?.nextCursor}`
    );
    expect(page2.body.data?.items.length).toBeGreaterThan(0);
    const page1Ids = new Set(page1.body.data?.items.map((item) => item.id));
    expect(page2.body.data?.items.some((item) => page1Ids.has(item.id))).toBe(false);
  });

  it('is admin-only for sessions but readable with a granted key', async () => {
    const { owner, workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    const asMember = await listEvents(member.bearer, workspace.slug);
    expect(asMember.status).toBe(403);

    const asKey = await listEvents(keyBearer, workspace.slug);
    expect(asKey.status).toBe(200);

    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const asAdmin = await listEvents(admin.bearer, workspace.slug);
    expect(asAdmin.status).toBe(200);
    void ownerBearer;
  });

  it('rejects garbage cursors and out-of-range limits', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const badCursor = await listEvents(ownerBearer, workspace.slug, '?cursor=nonsense!!');
    expect(badCursor.status).toBe(400);

    const badLimit = await listEvents(ownerBearer, workspace.slug, '?limit=9999');
    expect(badLimit.status).toBe(400);
  });

  it('never leaks another workspace’s events', async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    const marker = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: b.keyBearer,
      body: JSON.stringify({ name: 'Marker', slug: marker }),
    });

    const events = await listEvents(a.ownerBearer, a.workspace.slug);
    const serialized = JSON.stringify(events.body.data);
    expect(serialized).not.toContain(marker);
  });
});
