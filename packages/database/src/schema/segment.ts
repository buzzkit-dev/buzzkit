import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, updatedAt } from './shared';
import { tenant } from './tenant';

export const segment = pgTable(
  'segment',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentVersionId: bigRef('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('segment_tenant_slug_unique')
      .on(table.tenantId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('segment_tenant_idx').on(table.tenantId),
  ]
);

export const segmentVersion = pgTable(
  'segment_version',
  {
    id: bigId(),
    segmentId: bigRef('segment_id')
      .notNull()
      .references(() => segment.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    expression: jsonb('expression').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('segment_version_unique').on(table.segmentId, table.version)]
);

export const segmentTables = { segment, segmentVersion };
