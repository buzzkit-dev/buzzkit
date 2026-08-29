import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, channel, createdAt, deletedAt, provider, timestamptz, updatedAt } from './shared';
import { subscriber, subscription } from './subscriber';
import { tenant } from './tenant';
import { topic } from './topic';

export const messageStatus = pgEnum('message_status', [
  'queued',
  'processing',
  'completed',
  'scheduled',
  'canceled',
]);

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
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    channel: channel('channel').notNull(),
    topic: text('topic'),
    topicId: bigRef('topic_id').references(() => topic.id, { onDelete: 'restrict' }),
    targets: jsonb('targets').notNull(),
    payload: jsonb('payload').notNull(),
    idempotencyKey: text('idempotency_key'),
    idempotencyFingerprint: text('idempotency_fingerprint'),
    status: messageStatus('status').notNull().default('queued'),
    schedule: jsonb('schedule'),
    scheduledFor: timestamptz('scheduled_for'),
    scheduledZones: jsonb('scheduled_zones'),
    runId: text('run_id'),
    runStep: text('run_step'),
    canceledAt: timestamptz('canceled_at'),
    total: integer('total').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    delivered: integer('delivered').notNull().default(0),
    bounced: integer('bounced').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    invalid: integer('invalid').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    fanoutCursor: bigRef('fanout_cursor').notNull().default(0),
    fanoutCompletedAt: timestamptz('fanout_completed_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('message_tenant_idempotency_key_unique')
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null and ${table.deletedAt} is null`),
    index('message_tenant_idx').on(table.tenantId, table.id),
    index('message_run_idx').on(table.tenantId, table.runId).where(sql`${table.runId} is not null`),
    index('message_processing_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} in ('queued', 'processing') and ${table.fanoutCompletedAt} is null`),
    index('message_expiry_idx').on(table.expiresAt).where(sql`${table.status} <> 'completed'`),
    index('message_due_idx')
      .on(table.scheduledFor)
      .where(
        sql`${table.schedule} is not null and ${table.fanoutCompletedAt} is null and ${table.canceledAt} is null`
      ),
    index('message_unfinalized_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} = 'processing' and ${table.fanoutCompletedAt} is not null`),
    check('message_targets_object', sql`jsonb_typeof(${table.targets}) = 'object'`),
    check('message_payload_object', sql`jsonb_typeof(${table.payload}) = 'object'`),
  ]
);

export const delivery = pgTable(
  'delivery',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    messageId: bigRef('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'restrict' }),
    subscriberId: bigRef('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'restrict' }),
    subscriptionId: bigRef('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'restrict' }),
    channel: channel('channel').notNull(),
    provider: provider('provider').notNull(),
    status: deliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    providerMessageId: text('provider_message_id'),
    nextAttemptAt: timestamptz('next_attempt_at'),
    leaseExpiresAt: timestamptz('lease_expires_at'),
    firstAttemptedAt: timestamptz('first_attempted_at'),
    lastAttemptedAt: timestamptz('last_attempted_at'),
    sentAt: timestamptz('sent_at'),
    settledAt: timestamptz('settled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('delivery_message_subscription_unique').on(table.messageId, table.subscriptionId),
    index('delivery_message_idx').on(table.messageId, table.id),
    index('delivery_due_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'retrying' and ${table.nextAttemptAt} is not null`),
    index('delivery_message_status_idx').on(table.messageId, table.status, table.id),
    index('delivery_stale_idx')
      .on(sql`coalesce(${table.leaseExpiresAt}, ${table.createdAt})`)
      .where(sql`${table.status} in ('pending', 'retrying') and ${table.nextAttemptAt} is null`),
    index('delivery_created_brin').using('brin', table.createdAt),
  ]
);

export const deliveryAttempt = pgTable(
  'delivery_attempt',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    deliveryId: bigRef('delivery_id')
      .notNull()
      .references(() => delivery.id, { onDelete: 'restrict' }),
    attempt: integer('attempt').notNull(),
    provider: provider('provider').notNull(),
    outcome: deliveryAttemptOutcome('outcome').notNull(),
    errorCode: text('error_code'),
    providerReason: text('provider_reason'),
    providerStatus: integer('provider_status'),
    providerMessageId: text('provider_message_id'),
    request: jsonb('request'),
    response: jsonb('response'),
    latencyMs: integer('latency_ms'),
    nextAttemptAt: timestamptz('next_attempt_at'),
    startedAt: timestamptz('started_at').notNull(),
    finishedAt: timestamptz('finished_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('delivery_attempt_delivery_attempt_unique').on(table.deliveryId, table.attempt),
    index('delivery_attempt_created_brin').using('brin', table.createdAt),
  ]
);

export const messageTables = { message, delivery, deliveryAttempt };
