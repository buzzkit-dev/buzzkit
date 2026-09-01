import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type ActivityBody = { id: string; kind: string; activityId: string | null; endedAt: string | null };

const TOKEN = 'ab'.repeat(32);

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('/v1/client/live-activities', () => {
  it('registers an activity token (201 then 200 on refresh) and ends it', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const created = await api<ActivityBody>('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        activityId: 'match_1',
        attributesType: 'MatchAttributes',
        token: TOKEN,
        environment: 'sandbox',
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^act_/);

    const refreshed = await api<ActivityBody>('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        activityId: 'match_1',
        attributesType: 'MatchAttributes',
        token: TOKEN,
        environment: 'sandbox',
      }),
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data?.id).toBe(created.body.data?.id);

    const ended = await api<ActivityBody & { deleted: boolean }>('/v1/client/live-activities/match_1', {
      method: 'DELETE',
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
    });
    expect(ended.status).toBe(200);
    expect(ended.body.data?.endedAt).not.toBeNull();
  });

  it('requires a client key, the subscriber header on delete, and 404s unknown activities', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });

    const unauthenticated = await api('/v1/client/live-activities', {
      method: 'POST',
      body: JSON.stringify({ externalId, attributesType: 'MatchAttributes', token: TOKEN }),
    });
    expect(unauthenticated.status).toBe(401);

    const missingHeader = await api('/v1/client/live-activities/match_x', {
      method: 'DELETE',
      headers: clientBearer,
    });
    expect(missingHeader.status).toBe(400);

    const unknown = await api('/v1/client/live-activities/match_x', {
      method: 'DELETE',
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
    });
    expect(unknown.status).toBe(404);
  });
});
