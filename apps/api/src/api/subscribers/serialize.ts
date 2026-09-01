import type { Subscriber, SubscriberListItem, Subscription } from './types';

export function serializeSubscriber(subscriber: Subscriber) {
  return {
    id: subscriber.id,
    externalId: subscriber.externalId,
    attributes: subscriber.attributes,
    verified: subscriber.identityVerifiedAt !== null,
    identityVerifiedAt: subscriber.identityVerifiedAt,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    subscriberId: subscription.subscriberId,
    channel: subscription.channel,
    platform: subscription.platform,
    environment: subscription.environment,
    endpoint: subscription.endpoint,
    enabled: subscription.enabled,
    status: subscription.status,
    lastSeenAt: subscription.lastSeenAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

export function serializeSubscriberListItem(item: SubscriberListItem) {
  return {
    ...serializeSubscriber(item),
    lastSeenAt: item.lastSeenAt,
    channels: item.channels,
    platforms: item.platforms,
  };
}

export function resolveSubscriptionEventData(
  subscription: Pick<Subscription, 'channel' | 'platform' | 'endpoint' | 'enabled'>,
  externalId: string
) {
  return {
    externalId,
    channel: subscription.channel,
    platform: subscription.platform,
    endpoint: subscription.endpoint,
    enabled: subscription.enabled,
  };
}
