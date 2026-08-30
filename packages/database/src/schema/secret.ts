import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, updatedAt } from './shared';
import { tenant } from './tenant';

export const secret = pgTable(
  'secret',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretIv: text('secret_iv').notNull(),
    dekCiphertext: text('dek_ciphertext').notNull(),
    dekIv: text('dek_iv').notNull(),
    keyVersion: integer('key_version').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('secret_tenant_name_unique')
      .on(table.tenantId, table.name)
      .where(sql`${table.deletedAt} is null`),
  ]
);

export const secretTables = { secret };
