import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, channel, createdAt, deletedAt, provider, timestamptz, updatedAt } from './shared';
import { tenant } from './tenant';

export const credentialEnvironment = pgEnum('credential_environment', ['production', 'sandbox']);
export const credentialStatus = pgEnum('credential_status', ['unvalidated', 'active', 'invalid']);

export const credential = pgTable(
  'credential',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    provider: provider('provider').notNull(),
    environment: credentialEnvironment('environment').notNull().default('production'),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretIv: text('secret_iv').notNull(),
    dekCiphertext: text('dek_ciphertext').notNull(),
    dekIv: text('dek_iv').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    details: jsonb('details').notNull().default({}),
    status: credentialStatus('status').notNull().default('unvalidated'),
    lastError: text('last_error'),
    validatedAt: timestamptz('validated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('credential_tenant_channel_provider_environment_unique')
      .on(table.tenantId, table.channel, table.provider, table.environment)
      .where(sql`${table.deletedAt} is null`),
    check('credential_details_object', sql`jsonb_typeof(${table.details}) = 'object'`),
  ]
);

export const credentialTables = { credential };
