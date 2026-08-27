import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { bigId, bigRef, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { tenant } from './tenant';
import { workspace } from './workspace';

export const webhookEventSource = pgEnum('webhook_event_source', ['audit', 'stream']);

export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', [
  'pending',
  'success',
  'failed',
  'exhausted',
]);

export const webhookEndpoint = pgTable(
  'webhook_endpoint',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    tenantId: bigRef('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    events: text('events').array().notNull().default([]),
    secret: text('secret').notNull(),
    previousSecret: text('previous_secret'),
    previousSecretExpiresAt: timestamptz('previous_secret_expires_at'),
    disabledAt: timestamptz('disabled_at'),
    disabledReason: text('disabled_reason'),
    failingSince: timestamptz('failing_since'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [index('webhook_endpoint_workspace_idx').on(table.workspaceId)]
);

export const webhookEvent = pgTable(
  'webhook_event',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    tenantId: bigRef('tenant_id'),
    subscriberId: bigRef('subscriber_id'),
    source: webhookEventSource('source').notNull(),
    sourceId: text('source_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('webhook_event_source_unique').on(table.source, table.sourceId),
    index('webhook_event_workspace_idx').on(table.workspaceId, table.id),
  ]
);

export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id').notNull(),
    endpointId: bigRef('endpoint_id')
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: 'cascade' }),
    eventId: bigRef('event_id')
      .notNull()
      .references(() => webhookEvent.id, { onDelete: 'cascade' }),
    status: webhookDeliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamptz('next_attempt_at'),
    lastStatus: integer('last_status'),
    lastError: text('last_error'),
    lastAttemptAt: timestamptz('last_attempt_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('webhook_delivery_unique').on(table.endpointId, table.eventId),
    index('webhook_delivery_endpoint_idx').on(table.endpointId, table.id),
    index('webhook_delivery_event_idx').on(table.eventId),
    index('webhook_delivery_workspace_idx').on(table.workspaceId, table.id),
    index('webhook_delivery_due_idx').on(table.status, table.nextAttemptAt),
  ]
);

export const webhookAttempt = pgTable(
  'webhook_attempt',
  {
    id: bigId(),
    deliveryId: bigRef('delivery_id')
      .notNull()
      .references(() => webhookDelivery.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    status: integer('status'),
    error: text('error'),
    durationMs: integer('duration_ms').notNull(),
    responseBody: text('response_body'),
    createdAt: createdAt(),
  },
  (table) => [index('webhook_attempt_delivery_idx').on(table.deliveryId, table.id)]
);

export const webhookTables = { webhookEndpoint, webhookEvent, webhookDelivery, webhookAttempt };
