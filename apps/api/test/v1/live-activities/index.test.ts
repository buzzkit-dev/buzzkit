import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';

const TOKEN = 'a'.repeat(64);

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return {
    ...base,
    clientBearer: { Authorization: `Bearer ${clientKey.secret}` },
    tenantBearer: { ...base.keyBearer, 'buzzkit-tenant': 'default' },
  };
}

describe('live activities', () => {
  it('registers an activity token, refreshes it idempotently, and ends it', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const first = await api<{ id: string; kind: string; activityId: string }>('/v1/client/live-activities', {
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
    expect(first.status).toBe(201);
    expect(first.body.data?.id).toMatch(/^act_/);
    expect(first.body.data?.kind).toBe('activity');

    const refreshed = await api('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        activityId: 'match_1',
        attributesType: 'MatchAttributes',
        token: 'b'.repeat(64),
        environment: 'sandbox',
      }),
    });
    expect(refreshed.status).toBe(200);

    const ended = await api<{ deleted: boolean }>('/v1/client/live-activities/match_1', {
      method: 'DELETE',
      headers: { ...clientBearer, 'BuzzKit-Subscriber': externalId },
    });
    expect(ended.status).toBe(200);
    expect(ended.body.data?.deleted).toBe(true);
  });

  it('registers a push-to-start token without an activity id', async () => {
    const { clientBearer } = await setupClient();

    const start = await api<{ kind: string; activityId: string | null }>('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: `user_${uniq()}`,
        kind: 'start',
        attributesType: 'MatchAttributes',
        token: TOKEN,
      }),
    });
    expect(start.status).toBe(201);
    expect(start.body.data?.kind).toBe('start');
    expect(start.body.data?.activityId).toBeNull();

    const missingId = await api('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: `user_${uniq()}`,
        attributesType: 'MatchAttributes',
        token: TOKEN,
      }),
    });
    expect(missingId.status).toBe(400);
    expect(missingId.body.error?.code).toBe('activity_id_missing');
  });

  it('sends an update against APNs and reports the provider outcome per token', async () => {
    const { clientBearer, tenantBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    await api('/v1/client/live-activities', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        activityId: 'match_9',
        attributesType: 'MatchAttributes',
        token: TOKEN,
        environment: 'sandbox',
      }),
    });

    const sent = await api<{ results: Array<{ id: string; ok: boolean; code?: string }> }>(
      '/v1/live-activities/send',
      {
        method: 'POST',
        headers: tenantBearer,
        body: JSON.stringify({
          to: externalId,
          event: 'update',
          activityId: 'match_9',
          contentState: { score: 2 },
          alert: { title: 'Goal' },
        }),
      }
    );
    expect(sent.status).toBe(200);
    const result = sent.body.data?.results[0];
    expect(result?.id).toMatch(/^act_/);
    expect(result?.ok).toBe(false);
    expect(typeof result?.code).toBe('string');
  });

  it('validates targeting per event and unknown activities are 404', async () => {
    const { tenantBearer, clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });

    const missingType = await api('/v1/live-activities/send', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ to: externalId, event: 'start', contentState: {} }),
    });
    expect(missingType.status).toBe(400);
    expect(missingType.body.error?.code).toBe('attributes_type_missing');

    const missingAlert = await api('/v1/live-activities/send', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({
        to: externalId,
        event: 'start',
        attributesType: 'MatchAttributes',
        attributes: {},
        contentState: {},
      }),
    });

    expect(missingAlert.status).toBe(400);
    expect(missingAlert.body.error?.code).toBe('alert_missing');

    const missingActivity = await api('/v1/live-activities/send', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ to: externalId, event: 'update', contentState: {} }),
    });
    expect(missingActivity.status).toBe(400);

    const unknown = await api('/v1/live-activities/send', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({
        to: externalId,
        event: 'update',
        activityId: 'missing',
        contentState: {},
      }),
    });
    expect(unknown.status).toBe(404);
  });

  it('refuses client keys on the send route and secret keys on the client route', async () => {
    const { clientBearer, tenantBearer } = await setupClient();

    const clientSend = await api('/v1/live-activities/send', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ to: 'user_x', event: 'update', activityId: 'a', contentState: {} }),
    });
    expect(clientSend.status).toBe(401);

    const secretRegister = await api('/v1/client/live-activities', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ externalId: 'user_x', activityId: 'a', attributesType: 'T', token: TOKEN }),
    });
    expect(secretRegister.status).toBe(401);
  });
});
