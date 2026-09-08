import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

async function identify(clientBearer: Record<string, string>, body: Record<string, unknown>) {
  const response = await api<{ externalId: string }>('/v1/client/identify', {
    method: 'POST',
    headers: clientBearer,
    body: JSON.stringify(body),
  });
  return { status: response.status, code: response.body.error?.code, data: response.body.data };
}

async function timelineOf(keyBearer: Record<string, string>, externalId: string): Promise<string[]> {
  const { body } = await api<{ items: { name: string }[] }>(
    `/v1/subscribers/${externalId}/timeline?limit=100`,
    {
      headers: keyBearer,
    }
  );
  return (body.data?.items ?? []).map((event) => event.name);
}

describe('POST /v1/client/identify — merge retried after a refused identify', () => {
  it('still merges the anonymous subscriber once a later identify is accepted', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const anon = `anon_${uniq()}`;
    const user = `user_${uniq()}`;

    const tracked = await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: anon, source: 'ios', events: [{ name: 'retried.opened' }] }),
    });
    expect(tracked.status).toBe(202);

    const refused = await identify(clientBearer, {
      externalId: user,
      identityHash: 'a'.repeat(64),
      anonymousId: anon,
    });
    expect(refused.status).toBe(401);
    expect((await api(`/v1/subscribers/${user}`, { headers: keyBearer })).status).toBe(404);

    const accepted = await identify(clientBearer, { externalId: user, anonymousId: anon });
    expect(accepted.status).toBe(200);

    const names = await timelineOf(keyBearer, user);
    expect(names).toContain('$subscriber.merged');
    expect(names).toContain('retried.opened');
  });
});
