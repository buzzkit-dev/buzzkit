import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type Alias = { externalId: string; source: string };

type Detail = {
  id: string;
  externalId: string;
  subscriptions: { endpoint: string }[];
};

async function putSubscriber(
  keyBearer: Record<string, string>,
  externalId: string,
  attributes: Record<string, unknown> = {}
): Promise<string> {
  const { status, body } = await api<{ id: string }>(`/v1/subscribers/${externalId}`, {
    method: 'PUT',
    headers: keyBearer,
    body: JSON.stringify({ attributes }),
  });
  expect([200, 201]).toContain(status);
  return body.data!.id;
}

async function listAliases(
  keyBearer: Record<string, string>,
  externalId: string
): Promise<{ status: number; items: Alias[] }> {
  const { status, body } = await api<{ items: Alias[] }>(`/v1/subscribers/${externalId}/aliases`, {
    headers: keyBearer,
  });
  return { status, items: body.data?.items ?? [] };
}

async function addAlias(
  keyBearer: Record<string, string>,
  externalId: string,
  alias: string
): Promise<{ status: number; items: Alias[]; code?: string }> {
  const { status, body } = await api<{ items: Alias[] }>(`/v1/subscribers/${externalId}/aliases`, {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ externalId: alias }),
  });
  return { status, items: body.data?.items ?? [], code: body.error?.code };
}

async function detailOf(
  keyBearer: Record<string, string>,
  externalId: string
): Promise<{ status: number; data: Detail | null }> {
  const { status, body } = await api<Detail>(`/v1/subscribers/${externalId}`, { headers: keyBearer });
  return { status, data: body.data };
}

describe('/v1/subscribers/:externalId/aliases', () => {
  it('links an unused id and resolves the subscriber by it', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const legacy = `legacy_${uniq()}`;

    const id = await putSubscriber(keyBearer, externalId);

    const linked = await addAlias(keyBearer, externalId, legacy);
    expect(linked.status).toBe(201);
    expect(linked.items.map((alias) => alias.externalId)).toEqual([legacy]);
    expect(linked.items[0]?.source).toBe('manual');

    const byAlias = await detailOf(keyBearer, legacy);
    expect(byAlias.status).toBe(200);
    expect(byAlias.data?.id).toBe(id);
    expect(byAlias.data?.externalId).toBe(externalId);
  });

  it('merges an existing subscriber when the alias already belongs to one', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const imported = `onesignal:${uniq()}`;
    const token = `tok_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    await putSubscriber(keyBearer, imported, { plan: 'legacy' });
    const registered = await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: imported, channel: 'push', platform: 'ios', token }),
    });
    expect(registered.status).toBe(201);

    const linked = await addAlias(keyBearer, externalId, imported);
    expect(linked.status).toBe(201);
    expect(linked.items.map((alias) => alias.externalId)).toEqual([imported]);
    expect(linked.items[0]?.source).toBe('manual');

    const detail = await detailOf(keyBearer, externalId);
    expect(detail.data?.subscriptions.map((entry) => entry.endpoint)).toEqual([token]);

    const byAlias = await detailOf(keyBearer, imported);
    expect(byAlias.data?.externalId).toBe(externalId);
  });

  it('is idempotent when the alias already points at the subscriber', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const legacy = `legacy_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    await addAlias(keyBearer, externalId, legacy);
    const again = await addAlias(keyBearer, externalId, legacy);

    expect(again.status).toBe(201);
    expect(again.items.filter((alias) => alias.externalId === legacy)).toHaveLength(1);
  });

  it('refuses to alias a subscriber to its own id', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    const refused = await addAlias(keyBearer, externalId, externalId);

    expect(refused.status).toBe(409);
    expect(refused.code).toBe('alias_is_primary');
  });

  it('lists nothing for a subscriber that was never aliased, and 404s for an unknown one', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    expect((await listAliases(keyBearer, externalId)).items).toEqual([]);
    expect((await listAliases(keyBearer, `user_${uniq()}`)).status).toBe(404);
  });

  it('never resolves or lists an alias belonging to another tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const neighbour = await createTenant(keyBearer);
    const neighbourBearer = { ...keyBearer, 'buzzkit-tenant': neighbour.slug };
    const externalId = `user_${uniq()}`;
    const legacy = `legacy_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    expect((await addAlias(keyBearer, externalId, legacy)).status).toBe(201);

    expect((await detailOf(neighbourBearer, legacy)).status).toBe(404);
    expect((await listAliases(neighbourBearer, legacy)).status).toBe(404);

    const sameName = `user_${uniq()}`;
    await putSubscriber(neighbourBearer, sameName);
    expect((await listAliases(neighbourBearer, sameName)).items).toEqual([]);

    expect((await addAlias(neighbourBearer, sameName, legacy)).status).toBe(201);
    expect((await detailOf(keyBearer, legacy)).data?.externalId).toBe(externalId);
    expect((await detailOf(neighbourBearer, legacy)).data?.externalId).toBe(sameName);
  });

  it('keeps a second alias alongside the first', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const first = `legacy_${uniq()}`;
    const second = `crm_${uniq()}`;

    await putSubscriber(keyBearer, externalId);
    await addAlias(keyBearer, externalId, first);
    const linked = await addAlias(keyBearer, externalId, second);

    expect(linked.items.map((alias) => alias.externalId).sort()).toEqual([first, second].sort());
    expect((await detailOf(keyBearer, first)).data?.externalId).toBe(externalId);
    expect((await detailOf(keyBearer, second)).data?.externalId).toBe(externalId);
  });
});
