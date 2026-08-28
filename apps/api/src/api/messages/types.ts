import type { Delivery, DeliveryJob } from '@buzzkit/api/api/deliveries/index';
import type { Subscriber, Subscription } from '@buzzkit/api/api/subscribers/index';
import type { Channel } from '@buzzkit/api/api/topics/index';
import type { ProviderEnvironment } from '@buzzkit/api/providers/index';
import type { tables } from '@buzzkit/database';
import type { Expression } from 'buzzkit/expressions';
import type { MESSAGE_STATUSES } from './constants';

export type Message = typeof tables.message.$inferSelect;

export type MessageTargets = {
  to?: string[];
  topic?: string;
  segment?: string;
  segmentVersionId?: number;
  where?: Expression;
};

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type MessageFilters = {
  q?: string;
  status?: MessageStatus;
  channel?: Channel;
  topic?: string;
  from?: Date;
  to?: Date;
};

export type DeliveryQueueMessage =
  | { type: 'fanout'; messageId: number; afterId: number }
  | { type: 'deliver'; deliveryId: number; attempt: number };

export type TargetRow = { subscriptionId: number; subscriberId: number; platform: Subscription['platform'] };

export type TargetPage = { rows: TargetRow[]; cursor: number; done: boolean };

export type ResolvedCredential = {
  id: number;
  updatedAt: Date;
  environment: ProviderEnvironment;
  details: Record<string, string>;
  secret: string;
};

export type CredentialMemo = Map<string, Promise<ResolvedCredential | null>>;

export type ProcessedDelivery = {
  job: DeliveryJob;
  messageId: number | null;
  outcome: 'skipped' | 'sent' | 'retrying' | 'failed' | 'invalid';
  retryDelaySeconds: number | null;
};

export type ProcessableRow = {
  delivery: Pick<
    Delivery,
    'id' | 'tenantId' | 'messageId' | 'subscriberId' | 'subscriptionId' | 'status' | 'attempts' | 'provider'
  >;
  message: Pick<Message, 'id' | 'payload' | 'expiresAt'>;
  subscription: Pick<
    Subscription,
    'id' | 'endpoint' | 'enabled' | 'status' | 'deletedAt' | 'channel' | 'environment' | 'platform'
  >;
  subscriber: Pick<Subscriber, 'externalId' | 'deletedAt'>;
};
