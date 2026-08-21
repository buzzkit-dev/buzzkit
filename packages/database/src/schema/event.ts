import { index, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt } from './shared';

export const eventActorType = pgEnum('event_actor_type', ['member', 'user', 'key', 'system']);

export const event = pgTable(
  'event',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id'),
    tenantId: bigRef('tenant_id'),
    event: text('event').notNull(),
    actorType: eventActorType('actor_type').notNull(),
    actorUserId: text('actor_user_id'),
    actorMemberId: bigRef('actor_member_id'),
    actorKeyId: bigRef('actor_key_id'),
    actorDisplay: text('actor_display').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    data: jsonb('data'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    index('event_workspace_idx').on(table.workspaceId, table.id),
    index('event_workspace_event_idx').on(table.workspaceId, table.event, table.id),
    index('event_created_brin').using('brin', table.createdAt),
  ]
);

export const eventTables = { event };
