import type { Stats } from '@buzzkit/api/api/stats/types';
import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { grantAdmin } from '../../../utils/db';
import { addMember, createKey, setupWorkspace, signUpUser, uniq } from '../../../utils/setup';

async function platformStats(headers: Record<string, string>, query = '') {
  return api<Stats>(`/v1/admin/stats${query}`, { headers });
}

describe('GET /v1/admin/stats', () => {
  it('is admin-only: sessions without the flag get 403, keys get 401', async () => {
    const { owner, workspace, ownerBearer, keyBearer } = await setupWorkspace({ bare: true });
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const tenantKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: 'default' });

    expect((await platformStats({})).status).toBe(401);
    for (const headers of [ownerBearer, admin.bearer]) {
      const { status, body } = await platformStats(headers);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('admin_required');
    }
    for (const headers of [keyBearer, { Authorization: `Bearer ${tenantKey.secret}` }]) {
      expect((await platformStats(headers)).status).toBe(401);
    }
  });

  it('aggregates across every workspace and lists the busiest ones', async () => {
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    expect((await platformStats(support.bearer)).status).toBe(200);

    const a = await setupWorkspace({ bare: true });
    const b = await setupWorkspace({ bare: true });
    const from = new Date(Date.now() - 1_000).toISOString();
    for (const target of [a, b]) {
      for (const suffix of ['one', 'two']) {
        const created = await api(`/v1/subscribers/${uniq()}-${suffix}`, {
          method: 'PUT',
          headers: target.keyBearer,
          body: JSON.stringify({ attributes: { plan: 'pro' } }),
        });
        expect([200, 201]).toContain(created.status);
      }
    }

    const to = new Date(Date.now() + 1_000).toISOString();
    const after = await platformStats(support.bearer, `?from=${from}&to=${to}`);
    const data = after.body.data!;
    const growing = data.platform!.growingWorkspaces;
    for (const target of [a, b]) {
      expect(growing.find((row) => row.slug === target.workspace.slug)).toMatchObject({
        added: 2,
        subscribers: 2,
      });
    }
    expect(data.subscribers.added).toBeGreaterThanOrEqual(4);
    expect(data.workflows).toEqual([]);
    const platform = data.platform!;
    expect(platform.newestWorkspaces.length).toBeLessThanOrEqual(5);
    for (const row of platform.newestWorkspaces) expect(row.members).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(platform.topWorkspaces)).toBe(true);
    expect(Array.isArray(platform.eventWorkspaces)).toBe(true);
    expect(data.interval).toBe('hour');
    expect(data.series.reduce((total, day) => total + day.subscribers, 0)).toBeGreaterThanOrEqual(4);
  });

  it('honors the range and interval query like the tenant stats do', async () => {
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 3_600_000);

    const { status, body } = await platformStats(
      support.bearer,
      `?from=${from.toISOString()}&to=${to.toISOString()}&interval=hour`
    );
    expect(status).toBe(200);
    expect(body.data?.interval).toBe('hour');
    expect(body.data?.series.length).toBeGreaterThanOrEqual(6);

    const bad = await platformStats(support.bearer, `?from=${to.toISOString()}&to=${from.toISOString()}`);
    expect(bad.status).toBe(400);
  });

  it('never carries anything about the admin or per-workspace secrets', async () => {
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    const { body } = await platformStats(support.bearer);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/"admin":/);
    expect(text).not.toContain(support.email);
    expect(text).not.toContain('bk_');
  });
});
