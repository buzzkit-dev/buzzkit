import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { APNS_REACHABLE, uploadSandboxApns } from '../../../../utils/fixtures';
import { setupWorkspace } from '../../../../utils/setup';

type CredentialBody = { id: string; status: string; lastError: string | null };

describe('POST /v1/credentials/:id/validate', () => {
  it('revalidates a stored credential and reports the outcome', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    await uploadSandboxApns(keyBearer);

    const list = await api<{ items: CredentialBody[] }>('/v1/credentials', { headers: keyBearer });
    const id = list.body.data?.items[0]?.id ?? '';

    const validated = await api<CredentialBody>(`/v1/credentials/${id}/validate`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(validated.status).toBe(200);
    expect(validated.body.data?.id).toBe(id);
    if (APNS_REACHABLE) {
      expect(['active', 'invalid']).toContain(validated.body.data?.status);
    } else {
      expect(validated.body.data?.status).toBe('unvalidated');
    }
  });

  it('requires auth and answers 404 for unknown ids', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const unauthenticated = await api('/v1/credentials/crd_x/validate', { method: 'POST' });
    expect(unauthenticated.status).toBe(401);

    const unknown = await api('/v1/credentials/not-a-sqid/validate', { method: 'POST', headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
