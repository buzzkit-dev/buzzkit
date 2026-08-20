import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { setupWorkspace, signUpUser } from '../../utils/setup';

describe('/v1/profile', () => {
  it('returns and updates the signed-in user', async () => {
    const user = await signUpUser('Original Name');

    const get = await api<{ email: string; name: string }>('/v1/profile', { headers: user.bearer });
    expect(get.status).toBe(200);
    expect(get.body.data?.email).toBe(user.email);

    const patch = await api<{ name: string }>('/v1/profile', {
      method: 'PATCH',
      headers: user.bearer,
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data?.name).toBe('New Name');
  });

  it('rejects empty names and missing sessions', async () => {
    const user = await signUpUser();

    const empty = await api('/v1/profile', {
      method: 'PATCH',
      headers: user.bearer,
      body: JSON.stringify({ name: '' }),
    });
    expect(empty.status).toBe(400);

    const anonymous = await api('/v1/profile', {});
    expect(anonymous.status).toBe(401);
  });

  it('is session-only — API keys are refused', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status } = await api('/v1/profile', { headers: keyBearer });

    expect(status).toBe(401);
  });
});
