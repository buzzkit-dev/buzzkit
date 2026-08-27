import type { tables } from '@buzzkit/database';

export type WebhookEndpoint = typeof tables.webhookEndpoint.$inferSelect;
export type WebhookEvent = typeof tables.webhookEvent.$inferSelect;
export type WebhookDelivery = typeof tables.webhookDelivery.$inferSelect;
export type WebhookAttempt = typeof tables.webhookAttempt.$inferSelect;
export type WebhookDeliveryStatus = WebhookDelivery['status'];

export type WebhookPayload = Record<string, unknown>;

export type WebhookScope = {
  workspace: { id: number; slug: string; name: string };
  tenant: { id: number; slug: string; name: string } | null;
};

export type EndpointInput = {
  url: string;
  description?: string | null;
  events?: string[];
  tenantId?: number | null;
};

export type WebhookEventInput = {
  workspaceId: number;
  tenantId: number | null;
  subscriberId: number | null;
  source: WebhookEvent['source'];
  sourceId: string;
  type: string;
  payload: WebhookPayload;
};

export type AttemptOutcome = {
  attempt: number;
  status: number | null;
  error: string | null;
  durationMs: number;
  responseBody: string | null;
};

export type DeliveryOutcome = {
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastStatus: number | null;
  lastError: string | null;
};
