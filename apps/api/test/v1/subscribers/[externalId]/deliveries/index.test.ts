import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('timed out waiting for condition');
}

type DeliveryItem = {
  status: string;
  channel: string;
  message: { id: string; title: string | null; body: string | null };
};

describe('GET /v1/subscribers/:externalId/deliveries', () => {
  it('lists what a subscriber was sent, with the message summary and a total', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `inbox-${uniq()}`;
    const bystander = `bystander-${uniq()}`;
    for (const id of [externalId, bystander]) {
      await api('/v1/subscriptions', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ externalId: id, channel: 'push', platform: 'ios', token: fakeToken(id) }),
      });
    }

    const sent = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ title: 'Your order shipped', body: 'Arrives Thursday', to: externalId }),
    });
    expect(sent.status).toBe(202);

    const page = await waitFor(async () => {
      const { body } = await api<{ items: DeliveryItem[]; total: number }>(
        `/v1/subscribers/${encodeURIComponent(externalId)}/deliveries`,
        { headers: keyBearer }
      );
      return (body.data?.items.length ?? 0) > 0 ? body.data : null;
    });
    expect(page?.total).toBe(1);
    expect(page?.items[0]?.message.title).toBe('Your order shipped');
    expect(page?.items[0]?.message.id).toBe(sent.body.data?.id);
    expect(page?.items[0]?.channel).toBe('push');

    const none = await api<{ items: unknown[]; total: number }>(
      `/v1/subscribers/${encodeURIComponent(bystander)}/deliveries`,
      { headers: keyBearer }
    );
    expect(none.body.data?.items).toHaveLength(0);
    expect(none.body.data?.total).toBe(0);

    const missing = await api(`/v1/subscribers/nobody-${uniq()}/deliveries`, { headers: keyBearer });
    expect(missing.status).toBe(404);
  });
});
