import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { fakeToken } from '../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../utils/setup';

type MessageBody = { id: string; status: string; payload: { title: string } };

async function seedSentMessage(keyBearer: Record<string, string>) {
  const externalId = `user_${uniq()}`;
  await api('/v1/subscriptions', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
  });
  const sent = await api<MessageBody>('/v1/messages', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ to: externalId, title: 'Hello', body: 'World' }),
  });
  expect(sent.status).toBe(202);
  return sent.body.data?.id ?? '';
}

describe('GET /v1/messages/:id', () => {
  it('reads one message with its payload and status', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const id = await seedSentMessage(keyBearer);

    const fetched = await api<MessageBody>(`/v1/messages/${id}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toBe(id);
    expect(fetched.body.data?.payload.title).toBe('Hello');
  });

  it('requires auth, hides foreign messages and answers 404 for malformed ids', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const foreign = await setupWorkspace({ push: 'unusable' });
    const id = await seedSentMessage(keyBearer);

    const unauthenticated = await api(`/v1/messages/${id}`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/messages/not-a-sqid', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const crossTenant = await api(`/v1/messages/${id}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);
  });
});
