import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type WorkflowBody = {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: { number: number } | null;
};

const spec = { trigger: { event: 'trial.started' }, steps: [{ name: 'hello', send: { title: 'Hi' } }] };

async function createWorkflow(keyBearer: Record<string, string>, slug: string) {
  return api<WorkflowBody>('/v1/workflows', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ slug, name: 'Welcome', spec }),
  });
}

describe('/v1/workflows/:workflowSlug', () => {
  it('reads, patches (bumping the version only on spec change) and soft-deletes', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `flow-${uniq()}`;
    await createWorkflow(keyBearer, slug);

    const fetched = await api<WorkflowBody>(`/v1/workflows/${slug}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toMatch(/^wf_/);

    const renamed = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Onboarding' }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe('Onboarding');

    const unchanged = await api<WorkflowBody>(`/v1/workflows/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: '{}',
    });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data?.name).toBe('Onboarding');

    const deleted = await api(`/v1/workflows/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/workflows/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for unknown slugs', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const slug = `flow-${uniq()}`;
    await createWorkflow(keyBearer, slug);

    const unauthenticated = await api(`/v1/workflows/${slug}`);
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await api(`/v1/workflows/${slug}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);

    const unknown = await api(`/v1/workflows/ghost-${uniq()}`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
