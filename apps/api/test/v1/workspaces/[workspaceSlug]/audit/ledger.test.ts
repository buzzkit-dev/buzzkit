import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace } from '../../../../utils/setup';

type Entry = {
  event: string;
  data: Record<string, unknown> | null;
};

describe('the audit ledger records changes correctly', () => {
  it('every update carries changes and previousAttributes, and secret material never appears', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace({ bare: true });

    await api(`/v1/tenants/default`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Production' }),
    });

    const webhook = await api<{ id: string; secret: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://example.com/hooks', events: ['*'] }),
    });
    await api(`/v1/workspaces/${workspace.slug}/webhooks/${webhook.body.data?.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://example.com/hooks-v2' }),
    });

    await api('/v1/secrets/ledger_probe', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'sk_ledger_secret_1' }),
    });
    await api('/v1/secrets/ledger_probe', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'sk_ledger_secret_2' }),
    });

    const source = await api<{ id: string }>('/v1/sources', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Ledger probe', provider: 'custom', secret: 'shhh_ledger_source' }),
    });
    await api(`/v1/sources/${source.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ status: 'paused' }),
    });
    await api(`/v1/sources/${source.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({
        provider: 'stripe',
        verification: { scheme: 'stripe' },
        secret: 'whsec_ledger_switch',
      }),
    });

    const { status, body } = await api<{ items: Entry[] }>(
      `/v1/workspaces/${workspace.slug}/audit?limit=100`,
      { headers: ownerBearer }
    );
    expect(status).toBe(200);
    const items = body.data?.items ?? [];
    const of = (event: string) => items.filter((item) => item.event === event);

    const tenantUpdated = of('tenant.updated')[0]?.data as {
      changes: string[];
      previousAttributes: Record<string, unknown>;
    };
    expect(tenantUpdated.changes).toContain('name');
    expect(tenantUpdated.previousAttributes.name).toBe('Default');

    const webhookUpdated = of('webhook.updated')[0]?.data as {
      changes: string[];
      previousAttributes: Record<string, unknown>;
    };
    expect(webhookUpdated.changes).toEqual(['url']);
    expect(webhookUpdated.previousAttributes.url).toBe('https://example.com/hooks');

    const secretUpdated = of('secret.updated')[0]?.data;
    expect(secretUpdated).toMatchObject({ name: 'ledger_probe', version: 2 });

    const paused = of('source.updated').find((entry) => (entry.data?.changes as string[])?.includes('status'))
      ?.data as { changes: string[]; previousAttributes: Record<string, unknown> };
    expect(paused.previousAttributes.status).toBe('active');

    const switched = of('source.updated').find((entry) =>
      (entry.data?.changes as string[])?.includes('provider')
    )?.data as { changes: string[]; previousAttributes: Record<string, unknown>; secret?: string };
    expect(switched.changes).toEqual(expect.arrayContaining(['provider', 'verification']));
    expect(switched.previousAttributes.provider).toBe('custom');
    expect(switched.previousAttributes.verification).toMatchObject({ scheme: 'header' });
    expect(switched.secret).toBe('replaced');

    const everything = JSON.stringify(body);
    for (const leaked of [
      'sk_ledger_secret_1',
      'sk_ledger_secret_2',
      'shhh_ledger_source',
      'whsec_ledger_switch',
      webhook.body.data?.secret ?? 'whsec_never',
      'Ciphertext',
      'ciphertext',
      'dekIv',
      'secretIv',
    ]) {
      expect(everything).not.toContain(leaked);
    }
  });
});
