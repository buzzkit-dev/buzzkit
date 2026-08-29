import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { tenant } from './tenant';

export const workflowStatus = pgEnum('workflow_status', ['draft', 'active', 'paused']);

export const workflow = pgTable(
  'workflow',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: workflowStatus('status').notNull().default('draft'),
    currentVersionId: bigRef('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('workflow_tenant_slug_unique')
      .on(table.tenantId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('workflow_tenant_idx').on(table.tenantId),
  ]
);

export const workflowVersion = pgTable(
  'workflow_version',
  {
    id: bigId(),
    workflowId: bigRef('workflow_id')
      .notNull()
      .references(() => workflow.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    spec: jsonb('spec').notNull(),
    publishedAt: timestamptz('published_at'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('workflow_version_unique').on(table.workflowId, table.version)]
);

export const workflowTables = { workflow, workflowVersion };
