import { env, waitUntil } from 'cloudflare:workers';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { decodeSqid, encodeBareId, encodeId, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import {
  and,
  count,
  type Db,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
  tables,
} from '@buzzkit/database';
import { isPublicEvent } from './catalog';
import { serializeAuditEvent } from './serialize';
import type { Actor, AuditEntry, AuditFilters, AuditFn } from './types';

export { AUDIT_CATALOG, type AuditEventName, isPublicEvent, PUBLIC_EVENTS } from './catalog';
export * from './diff';
export * from './schemas';
export * from './serialize';
export type * from './types';

export function actorColumns(actor: Actor) {
  switch (actor.type) {
    case 'member':
      return {
        actorType: 'member' as const,
        actorUserId: actor.user.id,
        actorMemberId: actor.memberId,
        actorDisplay: actor.user.email,
      };
    case 'key':
      return {
        actorType: 'key' as const,
        actorKeyId: actor.apiKey.id,
        actorDisplay: `${actor.apiKey.name} (${actor.apiKey.prefix}…${actor.apiKey.last4})`,
      };
    case 'system':
      return { actorType: 'system' as const, actorDisplay: 'system' };
  }
}

export function createAuditLogger(
  db: Db,
  actor: Actor,
  request: Request | null,
  boundWorkspaceId: number | null
): AuditFn {
  const requestMeta = {
    requestId: request?.headers.get('cf-ray') ?? request?.headers.get('x-request-id') ?? null,
    ip: request?.headers.get('cf-connecting-ip') ?? null,
    userAgent: request?.headers.get('user-agent') ?? null,
  };

  return async (entry: AuditEntry) => {
    try {
      const [row] = await trace('audit.record', async () => {
        return await db
          .insert(tables.event)
          .values({
            workspaceId: entry.workspaceId !== undefined ? entry.workspaceId : boundWorkspaceId,
            tenantId: entry.tenantId,
            event: entry.event,
            ...actorColumns(actor),
            targetType: entry.target?.type,
            targetId:
              entry.target !== undefined
                ? typeof entry.target.id === 'number'
                  ? encodeBareId(TARGET_ENTITIES[entry.target.type], entry.target.id)
                  : entry.target.id
                : undefined,
            data: entry.data,
            ...requestMeta,
          })
          .returning({ id: tables.event.id });
      });
      if (row && isPublicEvent(entry.event)) enqueueWebhookEvents([row.id]);
    } catch (error) {
      log.error('[Audit] Failed to write event', {
        event: entry.event,
        workspaceId: entry.workspaceId,
        tenantId: entry.tenantId,
        error: describeError(error),
      });
    }
  };
}

export async function recordSystemAudit(
  db: Db,
  entries: Array<AuditEntry & { tenantId: number }>
): Promise<void> {
  if (entries.length === 0) return;

  const tenantIds = [...new Set(entries.map((entry) => entry.tenantId))];
  const tenants = await db
    .select({ id: tables.tenant.id, workspaceId: tables.tenant.workspaceId })
    .from(tables.tenant)
    .where(inArray(tables.tenant.id, tenantIds));
  const workspaceOf = new Map(tenants.map((tenant) => [tenant.id, tenant.workspaceId]));

  try {
    const rows = await trace('audit.recordMany', { 'audit.count': entries.length }, async () => {
      return await db
        .insert(tables.event)
        .values(
          entries.map((entry) => {
            return {
              workspaceId: workspaceOf.get(entry.tenantId) ?? null,
              tenantId: entry.tenantId,
              event: entry.event,
              ...actorColumns({ type: 'system' }),
              targetType: entry.target?.type,
              targetId:
                entry.target !== undefined
                  ? typeof entry.target.id === 'number'
                    ? encodeBareId(TARGET_ENTITIES[entry.target.type], entry.target.id)
                    : entry.target.id
                  : undefined,
              data: entry.data,
            };
          })
        )
        .returning({ id: tables.event.id, event: tables.event.event });
    });
    enqueueWebhookEvents(rows.filter((row) => isPublicEvent(row.event)).map((row) => row.id));
  } catch (error) {
    log.error('[Audit] Failed to write events', {
      count: entries.length,
      error: describeError(error),
    });
  }
}

function enqueueWebhookEvents(auditIds: number[]): void {
  if (auditIds.length === 0 || !env.WEBHOOKS) return;

  waitUntil(
    Promise.all(auditIds.map((auditId) => env.WEBHOOKS.send({ kind: 'audit', auditId }))).catch((error) => {
      log.error('[Audit] Could not enqueue webhook events, the sweep will pick them up', {
        auditIds,
        error: describeError(error),
      });
    })
  );
}

function resolveAuditFilters(workspaceId: number, filters: AuditFilters) {
  const needle = filters.q?.trim();

  return and(
    eq(tables.event.workspaceId, workspaceId),
    filters.event ? eq(tables.event.event, filters.event) : undefined,
    filters.actorType ? eq(tables.event.actorType, filters.actorType) : undefined,
    filters.from ? gte(tables.event.createdAt, new Date(filters.from)) : undefined,
    filters.to ? lte(tables.event.createdAt, new Date(filters.to)) : undefined,
    needle
      ? or(
          ilike(tables.event.event, `%${needle}%`),
          ilike(tables.event.actorDisplay, `%${needle}%`),
          ilike(tables.event.targetId, `%${needle.replace(/^[a-z]+_/, '')}%`),
          ilike(sql`${tables.event.data}->>'externalId'`, `%${needle}%`)
        )
      : undefined
  );
}

export async function listAuditEvents(
  db: Db,
  workspaceId: number,
  options: { cursor?: string; limit?: number } & AuditFilters = {}
) {
  const limit = clampLimit(options.limit);
  const cursorId = resolveCursor(options.cursor, decodeSqid);
  const filters = resolveAuditFilters(workspaceId, options);

  const [rows, [counted]] = await Promise.all([
    trace('audit.list', async () => {
      return await db
        .select()
        .from(tables.event)
        .where(and(filters, cursorId !== undefined ? lt(tables.event.id, cursorId) : undefined))
        .orderBy(desc(tables.event.id))
        .limit(limit + 1);
    }),
    trace('audit.count', async () => await db.select({ total: count() }).from(tables.event).where(filters)),
  ]);

  return {
    ...toPage(rows.map(serializeAuditEvent), limit, (id) => encodeId('audit', id)),
    total: Number(counted?.total ?? 0),
  };
}
