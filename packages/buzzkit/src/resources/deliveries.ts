import type { PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Channel, DELIVERY_ATTEMPT_OUTCOMES, DELIVERY_STATUSES, Provider } from './common';
import { listPage } from './list';

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type DeliveryAttemptOutcome = (typeof DELIVERY_ATTEMPT_OUTCOMES)[number];

export type Delivery = {
  id: string;
  messageId: string;
  subscriberId: string;
  subscriptionId: string;
  channel: Channel;
  provider: Provider;
  status: DeliveryStatus;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  providerMessageId: string | null;
  nextAttemptAt: string | null;
  firstAttemptedAt: string | null;
  lastAttemptedAt: string | null;
  sentAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryAttempt = {
  id: string;
  deliveryId: string;
  attempt: number;
  provider: Provider;
  outcome: DeliveryAttemptOutcome;
  errorCode: string | null;
  providerReason: string | null;
  providerStatus: number | null;
  providerMessageId: string | null;
  request: unknown;
  response: unknown;
  latencyMs: number | null;
  nextAttemptAt: string | null;
  startedAt: string;
  finishedAt: string;
};

export function deliveriesResource(transport: Transport) {
  return {
    retrieve(id: string): Promise<Delivery> {
      return transport.request({ method: 'GET', path: `/v1/deliveries/${encodeSegment(id)}` });
    },

    attempts(id: string): PagePromise<DeliveryAttempt> {
      return listPage(transport, `/v1/deliveries/${encodeSegment(id)}/attempts`, {});
    },
  };
}

export type DeliveriesResource = ReturnType<typeof deliveriesResource>;
