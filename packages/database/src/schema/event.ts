import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const eventActorType = pgEnum('event_actor_type', ['member', 'user', 'key', 'system']);

export const event = pgTable(
  'event',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer('workspace_id'),
    tenantId: integer('tenant_id'),
    event: text('event').notNull(),
    actorType: eventActorType('actor_type').notNull(),
    actorUserId: text('actor_user_id'),
    actorMemberId: integer('actor_member_id'),
    actorKeyId: integer('actor_key_id'),
    actorDisplay: text('actor_display').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    data: jsonb('data'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('event_workspace_idx').on(table.workspaceId, table.id),
    index('event_workspace_event_idx').on(table.workspaceId, table.event),
  ]
);

export const eventTables = { event };
