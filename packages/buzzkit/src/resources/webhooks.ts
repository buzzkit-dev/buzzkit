import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { Deleted, WEBHOOK_DELIVERY_STATUSES, WEBHOOK_EVENT_SOURCES } from './common';
import { listPage } from './list';

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type WebhookEndpoint = {
  id: string;
  tenantId: string | null;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  failingSince: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookEndpointWithSecret = WebhookEndpoint & {
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: string | null;
};

export type WebhookEvent = {
  id: string;
  type: string;
  source: (typeof WEBHOOK_EVENT_SOURCES)[number];
  tenantId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WebhookAttempt = {
  id: string;
  attempt: number;
  status: number | null;
  error: string | null;
  durationMs: number;
  responseBody: string | null;
  createdAt: string;
};

export type WebhookDelivery = {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string | null;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryDetail = Omit<WebhookDelivery, 'attempts'> & {
  attempts: WebhookAttempt[];
  event: WebhookEvent | null;
};

export type WebhookCatalogGroup = {
  label: string;
  wildcard?: string;
  options: string[];
};

export type CreateWebhookParams = {
  url: string;
  description?: string;
  events?: string[];
  tenant?: string;
};

export type UpdateWebhookParams = {
  url?: string;
  description?: string;
  events?: string[];
  tenant?: string;
  enabled?: boolean;
};

export type ListWebhookDeliveriesParams = PageParams & {
  status?: WebhookDeliveryStatus;
};

export function webhooksResource(transport: Transport, workspaceSlug: string) {
  const base = `/v1/workspaces/${encodeSegment(workspaceSlug)}/webhooks`;
  const endpoint = (id: string) => `${base}/${encodeSegment(id)}`;

  return {
    list(): PagePromise<WebhookEndpoint> {
      return listPage(transport, base, {});
    },

    create(params: CreateWebhookParams): Promise<WebhookEndpointWithSecret> {
      return transport.request({ method: 'POST', path: base, body: params });
    },

    catalog(): Promise<{ groups: WebhookCatalogGroup[] }> {
      return transport.request({ method: 'GET', path: `${base}/catalog` });
    },

    retrieve(id: string): Promise<WebhookEndpoint> {
      return transport.request({ method: 'GET', path: endpoint(id) });
    },

    update(id: string, params: UpdateWebhookParams): Promise<WebhookEndpoint> {
      return transport.request({ method: 'PATCH', path: endpoint(id), body: params });
    },

    remove(id: string): Promise<Deleted<WebhookEndpoint>> {
      return transport.request({ method: 'DELETE', path: endpoint(id) });
    },

    rotate(id: string): Promise<WebhookEndpointWithSecret> {
      return transport.request({ method: 'POST', path: `${endpoint(id)}/rotate` });
    },

    event(id: string): Promise<WebhookEvent> {
      return transport.request({ method: 'GET', path: `${base}/events/${encodeSegment(id)}` });
    },

    deliveries(id: string, params: ListWebhookDeliveriesParams = {}): PagePromise<WebhookDelivery> {
      return listPage(transport, `${endpoint(id)}/deliveries`, params);
    },

    delivery(id: string, deliveryId: string): Promise<WebhookDeliveryDetail> {
      return transport.request({
        method: 'GET',
        path: `${endpoint(id)}/deliveries/${encodeSegment(deliveryId)}`,
      });
    },

    replay(id: string, deliveryId: string): Promise<WebhookDelivery> {
      return transport.request({
        method: 'POST',
        path: `${endpoint(id)}/deliveries/${encodeSegment(deliveryId)}/replay`,
      });
    },
  };
}

export type WebhooksResource = ReturnType<typeof webhooksResource>;
