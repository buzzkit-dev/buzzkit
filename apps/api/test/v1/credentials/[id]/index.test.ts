import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { uploadSandboxApns } from '../../../utils/fixtures';
import { setupWorkspace } from '../../../utils/setup';

type CredentialBody = { id: string; provider: string; environment: string; status: string };

describe('/v1/credentials/:id', () => {
  it('reads one credential and soft-deletes it', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    await uploadSandboxApns(keyBearer);

    const list = await api<{ items: CredentialBody[] }>('/v1/credentials', { headers: keyBearer });
    const id = list.body.data?.items[0]?.id ?? '';
    expect(id).toMatch(/^crd_/);

    const fetched = await api<CredentialBody>(`/v1/credentials/${id}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toBe(id);
    expect(fetched.body.data?.provider).toBe('apns');

    const deleted = await api<{ deleted: boolean }>(`/v1/credentials/${id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.deleted).toBe(true);

    const gone = await api(`/v1/credentials/${id}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth and answers 404 for malformed or foreign ids', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    await uploadSandboxApns(keyBearer);
    const foreign = await setupWorkspace({ bare: true });

    const unauthenticated = await api('/v1/credentials/crd_x');
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/credentials/not-a-sqid', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const list = await api<{ items: CredentialBody[] }>('/v1/credentials', { headers: keyBearer });
    const id = list.body.data?.items[0]?.id ?? '';
    const crossTenant = await api(`/v1/credentials/${id}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);
  });
});
