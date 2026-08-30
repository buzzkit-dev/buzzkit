import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { subscriber } from './subscriber';
import { tenant } from './tenant';

export const sourceStatus = pgEnum('source_status', ['unverified', 'active', 'paused']);

export const sourceDeliveryOutcome = pgEnum('source_delivery_outcome', [
  'event',
  'duplicate',
  'dropped',
  'rejected',
  'unverified',
]);

export const source = pgTable(
  'source',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    status: sourceStatus('status').notNull().default('unverified'),
    verification: jsonb('verification').notNull().default({ scheme: 'header', header: 'x-buzzkit-secret' }),
    mapping: jsonb('mapping').notNull(),
    secretCiphertext: text('secret_ciphertext'),
    secretIv: text('secret_iv'),
    dekCiphertext: text('dek_ciphertext'),
    dekIv: text('dek_iv'),
    keyVersion: integer('key_version'),
    lastDeliveryAt: timestamptz('last_delivery_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [index('source_tenant_idx').on(table.tenantId, table.id)]
);

export const sourceDelivery = pgTable(
  'source_delivery',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    sourceId: bigRef('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id'),
    providerType: text('provider_type'),
    outcome: sourceDeliveryOutcome('outcome').notNull(),
    reason: text('reason'),
    detail: text('detail'),
    subscriberId: bigRef('subscriber_id').references(() => subscriber.id, { onDelete: 'set null' }),
    eventName: text('event_name'),
    eventId: text('event_id'),
    payload: jsonb('payload'),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index('source_delivery_source_idx').on(table.sourceId, table.id),
    uniqueIndex('source_delivery_event_unique')
      .on(table.sourceId, table.providerEventId)
      .where(sql`${table.outcome} = 'event' and ${table.providerEventId} is not null`),
  ]
);

export const sourceTables = { source, sourceDelivery };
