import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Channel, Deleted, Environment, Platform, SUBSCRIPTION_STATUSES } from './common';

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type Subscription = {
  id: string;
  subscriberId: string;
  channel: Channel;
  platform: Platform | null;
  environment: Environment;
  endpoint: string;
  enabled: boolean;
  status: SubscriptionStatus;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateSubscriptionParams = {
  externalId: string;
  channel?: Channel;
  platform?: Platform;
  environment?: Environment;
  token?: string;
  address?: string;
};

export type RegisteredSubscription = Subscription & { externalId: string };

export function subscriptionsResource(transport: Transport) {
  return {
    create(params: CreateSubscriptionParams): Promise<RegisteredSubscription> {
      return transport.request({ method: 'POST', path: '/v1/subscriptions', body: params });
    },

    retrieve(id: string): Promise<Subscription> {
      return transport.request({ method: 'GET', path: `/v1/subscriptions/${encodeSegment(id)}` });
    },

    update(id: string, params: { enabled: boolean }): Promise<Subscription> {
      return transport.request({
        method: 'PATCH',
        path: `/v1/subscriptions/${encodeSegment(id)}`,
        body: params,
      });
    },

    remove(id: string): Promise<Deleted<Subscription>> {
      return transport.request({ method: 'DELETE', path: `/v1/subscriptions/${encodeSegment(id)}` });
    },
  };
}

export type SubscriptionsResource = ReturnType<typeof subscriptionsResource>;
