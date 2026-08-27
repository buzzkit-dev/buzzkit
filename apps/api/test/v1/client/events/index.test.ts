import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type Tracked = { id: string; sequence: number; name: string; source: string; status: string };

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('POST /v1/client/events', () => {
  it('tracks a batch from the app with its source, allows the SDK events, and stamps system attributes', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const { status, body } = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: { ...clientBearer, 'accept-language': 'de-DE,de;q=0.9' },
      body: JSON.stringify({
        externalId,
        source: 'ios',
        events: [
          { id: `${uniq()}`, name: '$app.opened' },
          { id: `${uniq()}`, name: 'workout.completed', data: { duration: 12 } },
          { id: `${uniq()}`, name: '$app.backgrounded' },
        ],
      }),
    });

    expect(status).toBe(202);
    expect(body.data?.items.map((item) => item.name)).toEqual([
      '$app.opened',
      'workout.completed',
      '$app.backgrounded',
    ]);
    expect(body.data?.items.every((item) => item.source === 'ios' && item.status === 'accepted')).toBe(true);

    const subscriber = await api<{ attributes: Record<string, unknown> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.attributes.$language).toBe('de-DE');

    const timeline = await eventually(
      async () => {
        const { body } = await api<{ items: Tracked[] }>(`/v1/subscribers/${externalId}/timeline`, {
          headers: keyBearer,
        });
        return (body.data?.items.length ?? 0) >= 4 ? body.data : undefined;
      },
      { label: 'timeline' }
    );
    expect(timeline.items.map((item) => item.name)).toEqual([
      '$app.backgrounded',
      'workout.completed',
      '$app.opened',
      '$subscriber.created',
    ]);
  });

  it('refuses engine-reserved names from the app and replays are duplicates', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const reserved = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'ios', events: [{ name: '$subscriber.created' }] }),
    });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error?.code).toBe('reserved_event');

    const id = `${uniq()}`;
    const first = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'android', events: [{ id, name: 'screen.viewed' }] }),
    });
    const second = await api<{ items: Tracked[] }>('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'android', events: [{ id, name: 'screen.viewed' }] }),
    });
    expect(first.body.data?.items[0]?.status).toBe('accepted');
    expect(second.body.data?.items[0]?.status).toBe('duplicate');
    expect(second.body.data?.items[0]?.id).toBe(first.body.data?.items[0]?.id);
  });

  it('enforces identity verification like every client call', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupClient();
    const externalId = `user_${uniq()}`;

    await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });

    const unsigned = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'ios', events: [{ name: 'x' }] }),
    });
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.error?.code).toBe('identity_required');

    const secret = await api<{ identitySecret: string }>('/v1/tenants/default/identity-secret', {
      headers: { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
    });
    const identityHash = createHmac('sha256', secret.body.data!.identitySecret)
      .update(externalId)
      .digest('hex');

    const signed = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, identityHash, source: 'ios', events: [{ name: 'x' }] }),
    });
    expect(signed.status).toBe(202);

    const subscriber = await api<{ verified: boolean }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.body.data?.verified).toBe(true);
  });
});
