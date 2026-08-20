import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { channel } from './shared';
import { tenant } from './tenant';

export const credentialProvider = pgEnum('credential_provider', ['apns', 'fcm', 'resend']);
export const credentialEnvironment = pgEnum('credential_environment', ['production', 'sandbox']);
export const credentialStatus = pgEnum('credential_status', ['unvalidated', 'active', 'invalid']);

export const credential = pgTable(
  'credential',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull().default('push'),
    provider: credentialProvider('provider').notNull(),
    environment: credentialEnvironment('environment').notNull().default('production'),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretIv: text('secret_iv').notNull(),
    dekCiphertext: text('dek_ciphertext').notNull(),
    dekIv: text('dek_iv').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    details: jsonb('details').notNull().default({}),
    status: credentialStatus('status').notNull().default('unvalidated'),
    lastError: text('last_error'),
    validatedAt: timestamp('validated_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('credential_tenant_provider_env_unique')
      .on(table.tenantId, table.channel, table.provider, table.environment)
      .where(sql`${table.deletedAt} is null`),
    index('credential_tenant_idx').on(table.tenantId),
  ]
);

export const credentialTables = { credential };
