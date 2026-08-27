import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { createKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

describe('GET /v1/subscribers/:externalId/timeline', () => {
  it('404s for an unknown subscriber and needs subscribers:read', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();

    const unknown = await api(`/v1/subscribers/nobody_${uniq()}/timeline`, { headers: keyBearer });
    expect(unknown.status).toBe(404);

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    const limited = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const denied = await api(`/v1/subscribers/${externalId}/timeline`, {
      headers: { Authorization: `Bearer ${limited.secret}` },
    });
    expect(denied.status).toBe(403);
  });

  it('is scoped to the tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    await eventually(async () => {
      const { body } = await api<{ items: Array<{ name: string }> }>(
        `/v1/subscribers/${externalId}/timeline`,
        {
          headers: keyBearer,
        }
      );
      return body.data?.items.length ? true : undefined;
    });

    const foreign = await api(`/v1/subscribers/${externalId}/timeline`, {
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(foreign.status).toBe(404);
  });
});
