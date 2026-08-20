import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { channel } from './shared';
import { subscriber, subscription } from './subscriber';
import { tenant } from './tenant';

export const messageStatus = pgEnum('message_status', ['queued', 'processing', 'completed']);

export const deliveryStatus = pgEnum('delivery_status', [
  'pending',
  'retrying',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'invalid',
]);

export const deliveryAttemptOutcome = pgEnum('delivery_attempt_outcome', [
  'sent',
  'retry',
  'failed',
  'invalid',
]);

export const message = pgTable(
  'message',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    topic: text('topic'),
    targets: jsonb('targets').notNull(),
    payload: jsonb('payload').notNull(),
    idempotencyKey: text('idempotency_key'),
    status: messageStatus('status').notNull().default('queued'),
    total: integer('total').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    delivered: integer('delivered').notNull().default(0),
    bounced: integer('bounced').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    invalid: integer('invalid').notNull().default(0),
    expiresAt: timestamp('expires_at'),
    fanoutCursor: integer('fanout_cursor').notNull().default(0),
    fanoutCompletedAt: timestamp('fanout_completed_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('message_tenant_idempotency_unique')
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null and ${table.deletedAt} is null`),
    index('message_tenant_idx').on(table.tenantId, table.id),
    index('message_processing_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} = 'processing' and ${table.fanoutCompletedAt} is null`),
    index('message_expiry_idx').on(table.expiresAt).where(sql`${table.status} <> 'completed'`),
    index('message_unfinalized_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} = 'processing' and ${table.fanoutCompletedAt} is not null`),
  ]
);

export const delivery = pgTable(
  'delivery',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    messageId: integer('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    subscriberId: integer('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    provider: text('provider').notNull(),
    status: deliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    providerMessageId: text('provider_message_id'),
    nextAttemptAt: timestamp('next_attempt_at'),
    firstAttemptedAt: timestamp('first_attempted_at'),
    lastAttemptedAt: timestamp('last_attempted_at'),
    sentAt: timestamp('sent_at'),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('delivery_message_subscription_unique').on(table.messageId, table.subscriptionId),
    index('delivery_message_idx').on(table.messageId, table.id),
    index('delivery_tenant_idx').on(table.tenantId, table.id),
    index('delivery_due_idx').on(table.nextAttemptAt).where(sql`${table.status} in ('pending', 'retrying')`),
    index('delivery_unsettled_idx')
      .on(table.messageId)
      .where(sql`${table.status} in ('pending', 'retrying')`),
  ]
);

export const deliveryAttempt = pgTable(
  'delivery_attempt',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    deliveryId: integer('delivery_id')
      .notNull()
      .references(() => delivery.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    provider: text('provider').notNull(),
    outcome: deliveryAttemptOutcome('outcome').notNull(),
    errorCode: text('error_code'),
    providerReason: text('provider_reason'),
    providerStatus: integer('provider_status'),
    providerMessageId: text('provider_message_id'),
    request: jsonb('request'),
    response: jsonb('response'),
    latencyMs: integer('latency_ms'),
    nextAttemptAt: timestamp('next_attempt_at'),
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('delivery_attempt_unique').on(table.deliveryId, table.attempt),
    index('delivery_attempt_tenant_idx').on(table.tenantId, table.id),
  ]
);

export const messageTables = { message, delivery, deliveryAttempt };
