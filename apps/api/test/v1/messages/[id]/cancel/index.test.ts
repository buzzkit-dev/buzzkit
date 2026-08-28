import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { createKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type MessageBody = {
  id: string;
  status: string;
  canceledAt: string | null;
  scheduledFor: string | null;
  counts: { total: number };
};

async function tick() {
  const response = await fetch(`${BASE_URL}/__scheduled?cron=*+*+*+*+*`);
  if (!response.ok) throw new Error(`schedule tick failed: ${response.status}`);
}

describe('POST /v1/messages/:id/cancel', () => {
  it('cancels a scheduled message before it fires, once, and refuses anything already sent', async () => {
    const { keyBearer, workspace, owner, ownerBearer } = await setupWorkspace({ push: 'unusable' });
    const externalId = `cancel_${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        externalId,
        channel: 'push',
        platform: 'ios',
        environment: 'sandbox',
        token: fakeToken('c'),
      }),
    });

    const scheduled = await api<MessageBody>('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        to: externalId,
        title: 'Later',
        schedule: { at: '2099-01-01T10:00', timezone: 'UTC' },
      }),
    });
    expect(scheduled.status).toBe(202);
    const id = scheduled.body.data!.id;

    const reader = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const forbidden = await api(`/v1/messages/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reader.secret}` },
    });
    expect(forbidden.status).toBe(403);

    const other = await createTenant(keyBearer, 'Other');
    const foreign = await api(`/v1/messages/${id}/cancel`, {
      method: 'POST',
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(foreign.status).toBe(404);

    const canceled = await api<MessageBody>(`/v1/messages/${id}/cancel`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(canceled.status).toBe(200);
    expect(canceled.body.data?.status).toBe('canceled');
    expect(canceled.body.data?.canceledAt).not.toBeNull();

    await tick();
    const after = await api<MessageBody>(`/v1/messages/${id}`, { headers: keyBearer });
    expect(after.body.data?.status).toBe('canceled');
    expect(after.body.data?.counts.total).toBe(0);

    const again = await api(`/v1/messages/${id}/cancel`, { method: 'POST', headers: keyBearer });
    expect(again.status).toBe(400);
    expect(again.body.error?.code).toBe('message_not_cancelable');

    const immediate = await api<MessageBody>('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ to: externalId, title: 'Now' }),
    });
    const sent = await api(`/v1/messages/${immediate.body.data!.id}/cancel`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(sent.status).toBe(400);

    const listed = await api<{ items: MessageBody[] }>('/v1/messages?status=canceled', {
      headers: keyBearer,
    });
    expect(listed.body.data?.items.map((item) => item.id)).toEqual([id]);

    const audit = await api<{ items: Array<{ event: string; data: { status?: string } }> }>(
      `/v1/workspaces/${workspace.slug}/audit`,
      { headers: ownerBearer }
    );
    const entry = audit.body.data?.items.find((item) => item.event === 'message.canceled');
    expect(entry?.data.status).toBe('canceled');
  });
});
