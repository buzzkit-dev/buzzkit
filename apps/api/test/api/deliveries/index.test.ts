import { type SubscriberDeliveryRow, serializeSubscriberDelivery } from '@buzzkit/api/api/deliveries/index';
import { describe, expect, it } from 'vitest';

const at = new Date('2026-08-24T10:00:00.000Z');

function row(payload: Record<string, unknown>): SubscriberDeliveryRow {
  return {
    delivery: {
      id: 41,
      tenantId: 1,
      messageId: 7,
      subscriberId: 3,
      subscriptionId: 9,
      channel: 'push',
      provider: 'apns',
      status: 'sent',
      attempts: 1,
      lastErrorCode: null,
      lastErrorMessage: null,
      providerMessageId: 'apns-1',
      nextAttemptAt: null,
      leaseExpiresAt: null,
      firstAttemptedAt: at,
      lastAttemptedAt: at,
      sentAt: at,
      settledAt: at,
      createdAt: at,
      updatedAt: at,
    } as SubscriberDeliveryRow['delivery'],
    message: {
      id: 7,
      tenantId: 1,
      channel: 'push',
      topic: 'deals',
      payload,
      createdAt: at,
    } as SubscriberDeliveryRow['message'],
  };
}

describe('serializeSubscriberDelivery', () => {
  it('nests an encoded message summary next to the delivery', () => {
    const out = serializeSubscriberDelivery(
      row({ title: 'Flash sale', body: 'Ends tonight', data: { x: 1 } })
    );
    expect(out.id).toBe(41);
    expect(out.status).toBe('sent');
    expect(out.sentAt).toBe(at);
    expect(out.message).toEqual({
      id: expect.stringMatching(/^msg_/),
      channel: 'push',
      topic: 'deals',
      title: 'Flash sale',
      body: 'Ends tonight',
      createdAt: at,
    });
  });

  it('never leaks the raw payload and nulls a missing title or body', () => {
    const out = serializeSubscriberDelivery(row({ data: { deepLink: 'app://x' } }));
    expect(out.message.title).toBeNull();
    expect(out.message.body).toBeNull();
    expect(out.message).not.toHaveProperty('payload');
    expect(out.message).not.toHaveProperty('data');
  });
});
