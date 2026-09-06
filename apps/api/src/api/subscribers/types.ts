import type { tables } from '@buzzkit/database';

export type Subscriber = typeof tables.subscriber.$inferSelect;

export type Subscription = typeof tables.subscription.$inferSelect;

export type SubscriberAlias = typeof tables.subscriberAlias.$inferSelect;

export type SubscriberAliasSource = SubscriberAlias['source'];

export type SubscriptionChannel = Subscription['channel'];

export type SubscriberInput = {
  attributes?: Record<string, unknown>;
  mergeAttributes?: boolean;
  systemAttributes?: Record<string, unknown>;
  verifiedNow?: boolean;
};

export type SubscriberListItem = Subscriber & {
  lastSeenAt: Date | null;
  channels: string[];
  platforms: string[];
};

export type SubscriberMerge = {
  subscriber: Subscriber;
  from: string;
};

export type SubscriberAliasLink = {
  subscriber: Subscriber;
  alias: string;
  merged: boolean;
};

export type SubscriptionRegistration = {
  subscription: Subscription;
  subscriptionCreated: boolean;
  subscriptionRegistered: boolean;
  movedFrom: { subscriber: Subscriber; subscription: Subscription } | null;
  subscriberCreated: boolean;
  subscriber: Subscriber;
};
