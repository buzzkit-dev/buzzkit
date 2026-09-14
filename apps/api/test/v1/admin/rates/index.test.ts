import type { StatsRates } from '@buzzkit/api/api/stats/types';
import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { grantAdmin } from '../../../utils/db';
import { eventually } from '../../../utils/eventually';
import { addMember, createKey, setupWorkspace, signUpUser, uniq } from '../../../utils/setup';

async function rates(headers: Record<string, string>) {
  return api<StatsRates>('/v1/admin/rates', { headers });
}

function total(rate: StatsRates[keyof Omit<StatsRates, 'window'>]) {
  return rate.series.reduce((sum, entry) => sum + entry.count, 0);
}

describe('GET /v1/admin/rates', () => {
  it('is admin-only: sessions without the flag get 403, keys get 401', async () => {
    const { owner, workspace, ownerBearer, keyBearer } = await setupWorkspace({ bare: true });
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const tenantKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: 'default' });

    expect((await rates({})).status).toBe(401);
    for (const headers of [ownerBearer, admin.bearer]) {
      const { status, body } = await rates(headers);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('admin_required');
    }
    for (const headers of [keyBearer, { Authorization: `Bearer ${tenantKey.secret}` }]) {
      expect((await rates(headers)).status).toBe(401);
    }
  });

  it('returns thirty whole minutes per signal and a per-minute figure over the last five', async () => {
    const support = await signUpUser('Support');
    await grantAdmin(support.email);

    const { status, body } = await rates(support.bearer);
    expect(status).toBe(200);
    const data = body.data!;
    expect(data.window.sampleMinutes).toBe(5);
    expect(new Date(data.window.to).getTime() - new Date(data.window.from).getTime()).toBe(30 * 60_000);
    expect(new Date(data.window.to).getSeconds()).toBe(0);
    for (const signal of [data.deliveries, data.messages, data.events, data.runs]) {
      expect(signal.series).toHaveLength(30);
      expect(signal.series[0]?.minute).toBe(data.window.from);
      expect(signal.series.every((entry) => entry.count >= 0)).toBe(true);
      expect(signal.perMinute).toBeGreaterThanOrEqual(0);
      const sampled = signal.series.slice(-5).reduce((sum, entry) => sum + entry.count, 0);
      expect(signal.perMinute).toBe(Math.round((sampled / 5) * 10) / 10);
    }
  });

  it('counts tracked events and sent messages across every workspace, leaving out system events', async () => {
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    const before = (await rates(support.bearer)).body.data!;

    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const name = `rate.${uniq()}`;
    const tracked = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId, name },
          { externalId, name },
        ],
      }),
    });
    expect([200, 202]).toContain(tracked.status);

    const sent = await api('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ to: externalId, title: 'Rate', body: 'One message' }),
    });
    expect([200, 201, 202]).toContain(sent.status);

    const after = await eventually(
      async () => {
        const current = (await rates(support.bearer)).body.data!;
        if (total(current.events) < total(before.events) + 2) return undefined;
        if (total(current.messages) < total(before.messages) + 1) return undefined;
        return current;
      },
      { timeoutMs: 30_000, label: 'the rates strip to see the new events and message' }
    );
    expect(after.window.from <= after.events.series[0]!.minute).toBe(true);
  });
});
