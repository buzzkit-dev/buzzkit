import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment, randomIdempotencyKey } from '../core/transport';
import type { Expression } from '../expressions/index';
import type { INTERRUPTION_LEVELS, SEND_PRIORITIES } from '../workflows/index';
import type { Channel, MESSAGE_STATUSES } from './common';
import type { Delivery, DeliveryStatus } from './deliveries';
import { listPage } from './list';

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type MessagePriority = (typeof SEND_PRIORITIES)[number];

export type InterruptionLevel = (typeof INTERRUPTION_LEVELS)[number];

export type MessageAction = {
  id: string;
  title: string;
  destructive?: boolean;
  foreground?: boolean;
  input?: boolean;
  placeholder?: string;
};

export type MessagePayload = {
  title?: string;
  body?: string;
  subtitle?: string;
  badge?: number;
  sound?: string;
  imageUrl?: string;
  data?: Record<string, unknown>;
  collapseId?: string;
  priority?: MessagePriority;
  threadId?: string;
  category?: string;
  interruptionLevel?: InterruptionLevel;
  relevanceScore?: number;
  targetContentId?: string;
  deepLink?: string;
  action?: { name: string; data?: Record<string, unknown> };
  policy?: 'ignore';
  actions?: MessageAction[];
  apns?: { payload?: Record<string, unknown> };
  fcm?: { android?: Record<string, unknown>; payload?: Record<string, unknown> };
};

export type MessageScheduleInput = {
  at: string;
  timezone?: string;
  defaultTimezone?: string;
};

export type MessageSchedule = {
  at: string;
  timezone: string;
  defaultTimezone?: string;
};

export type SendMessageParams = MessagePayload & {
  to?: string | string[];
  topic?: string;
  segment?: string;
  where?: Expression;
  channel?: Channel;
  ttlSeconds?: number;
  schedule?: MessageScheduleInput;
  idempotencyKey?: string;
};

export type MessageTargets = {
  to?: string[];
  topic?: string;
  segment?: string;
  segmentVersion?: string;
  where?: Expression;
};

export type MessageCounts = {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  invalid: number;
};

export type Message = {
  id: string;
  channel: Channel;
  topic: string | null;
  targets: MessageTargets;
  payload: MessagePayload;
  run: { id: string; step: string } | null;
  status: MessageStatus;
  counts: MessageCounts;
  idempotencyKey: string | null;
  schedule: MessageSchedule | null;
  scheduledFor: string | null;
  canceledAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ListMessagesParams = PageParams & {
  q?: string;
  status?: MessageStatus;
  channel?: Channel;
  topic?: string;
  from?: string;
  to?: string;
};

export type ListMessageDeliveriesParams = PageParams & {
  status?: DeliveryStatus;
};

export type MessageDelivery = Delivery & {
  externalId: string;
  platform: string | null;
  endpoint: string | null;
};

export function messagesResource(transport: Transport) {
  return {
    list(params: ListMessagesParams = {}): PagePromise<Message> {
      return listPage(transport, '/v1/messages', params);
    },

    send(params: SendMessageParams): Promise<Message> {
      const { idempotencyKey, ...body } = params;

      return transport.request({
        method: 'POST',
        path: '/v1/messages',
        body,
        idempotencyKey: idempotencyKey ?? randomIdempotencyKey(),
      });
    },

    retrieve(id: string): Promise<Message> {
      return transport.request({ method: 'GET', path: `/v1/messages/${encodeSegment(id)}` });
    },

    cancel(id: string): Promise<Message> {
      return transport.request({ method: 'POST', path: `/v1/messages/${encodeSegment(id)}/cancel` });
    },

    deliveries(id: string, params: ListMessageDeliveriesParams = {}): PagePromise<MessageDelivery> {
      return listPage(transport, `/v1/messages/${encodeSegment(id)}/deliveries`, params);
    },
  };
}

export type MessagesResource = ReturnType<typeof messagesResource>;
