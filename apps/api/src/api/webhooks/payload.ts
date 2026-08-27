import type { ActorEventRow } from '@buzzkit/api/actor/types';
import type { AuditRow } from '@buzzkit/api/api/audit/index';
import { serializeCredential } from '@buzzkit/api/api/credentials/index';
import { serializeInvite } from '@buzzkit/api/api/invites/index';
import { serializeMember } from '@buzzkit/api/api/members/index';
import { serializeMessage } from '@buzzkit/api/api/messages/index';
import { serializeTenant } from '@buzzkit/api/api/tenants/index';
import { serializeTopic } from '@buzzkit/api/api/topics/index';
import { serializeWorkspace } from '@buzzkit/api/api/workspaces/index';
import { transformIds } from '@buzzkit/api/libs/response';
import { decodeSqid, encodeId, type IdEntity, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import { type Db, eq, tables } from '@buzzkit/database';
import type { WebhookPayload, WebhookScope } from './types';

export const WEBHOOK_API_VERSION = 'v1';

export async function resolveWebhookScope(
  db: Db,
  workspaceId: number,
  tenantId: number | null
): Promise<WebhookScope | null> {
  const [workspace] = await db
    .select({ id: tables.workspace.id, slug: tables.workspace.slug, name: tables.workspace.name })
    .from(tables.workspace)
    .where(eq(tables.workspace.id, workspaceId));
  if (!workspace) return null;
  const [tenant] =
    tenantId === null
      ? []
      : await db
          .select({ id: tables.tenant.id, slug: tables.tenant.slug, name: tables.tenant.name })
          .from(tables.tenant)
          .where(eq(tables.tenant.id, tenantId));
  return { workspace, tenant: tenant ?? null };
}

function scopeFields(scope: WebhookScope) {
  return {
    workspace: { id: encodeId('workspace', scope.workspace.id), slug: scope.workspace.slug },
    tenant: scope.tenant ? { id: encodeId('tenant', scope.tenant.id), slug: scope.tenant.slug } : null,
  };
}

export async function buildAuditPayload(db: Db, row: AuditRow, scope: WebhookScope): Promise<WebhookPayload> {
  const data = ((row.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const targetEntity = row.targetType ? TARGET_ENTITIES[row.targetType] : undefined;
  return {
    id: null,
    type: row.event,
    apiVersion: WEBHOOK_API_VERSION,
    createdAt: row.createdAt.toISOString(),
    ...scopeFields(scope),
    actor: { type: row.actorType, display: row.actorDisplay },
    request: row.requestId ? { id: row.requestId } : null,
    target: row.targetType
      ? {
          type: row.targetType,
          id: row.targetId && targetEntity ? prefixedTargetId(targetEntity, row.targetId) : row.targetId,
        }
      : null,
    data: { object: await resolveTargetObject(db, row), ...data },
  };
}

export function buildStreamPayload(
  row: ActorEventRow,
  subscriber: { id: number; externalId: string },
  scope: WebhookScope
): WebhookPayload {
  return {
    id: null,
    type: row.name,
    apiVersion: WEBHOOK_API_VERSION,
    createdAt: row.received_at,
    ...scopeFields(scope),
    data: {
      object: {
        id: row.id,
        sequence: row.sequence,
        name: row.name,
        source: row.source,
        timestamp: row.timestamp,
        receivedAt: row.received_at,
        data: JSON.parse(row.data) as Record<string, unknown>,
        subscriber: { id: encodeId('subscriber', subscriber.id), externalId: subscriber.externalId },
      },
    },
  };
}

function prefixedTargetId(entity: IdEntity, bare: string): string {
  if (bare.includes('_')) return bare;
  const id = decodeSqid(bare);
  return id ? encodeId(entity, id) : bare;
}

async function resolveTargetObject(db: Db, row: AuditRow): Promise<Record<string, unknown> | null> {
  if (!row.targetType || !row.targetId) return null;
  const id = decodeSqid(
    row.targetId.includes('_') ? row.targetId.slice(row.targetId.indexOf('_') + 1) : row.targetId
  );
  if (!id) return null;

  switch (row.targetType) {
    case 'workspace': {
      const [record] = await db.select().from(tables.workspace).where(eq(tables.workspace.id, id));
      return record ? transformIds(serializeWorkspace(record), [], [], 'workspace') : null;
    }
    case 'tenant': {
      const [record] = await db.select().from(tables.tenant).where(eq(tables.tenant.id, id));
      return record ? transformIds(serializeTenant(record), [], [], 'tenant') : null;
    }
    case 'credential': {
      const [record] = await db.select().from(tables.credential).where(eq(tables.credential.id, id));
      return record ? transformIds(serializeCredential(record), ['details'], [], 'credential') : null;
    }
    case 'topic': {
      const [record] = await db.select().from(tables.topic).where(eq(tables.topic.id, id));
      return record ? transformIds(serializeTopic(record), ['channelDefaults'], [], 'topic') : null;
    }
    case 'message': {
      const [record] = await db.select().from(tables.message).where(eq(tables.message.id, id));
      return record ? transformIds(serializeMessage(record), ['payload', 'data'], [], 'message') : null;
    }
    case 'member': {
      const [record] = await db
        .select()
        .from(tables.workspaceMember)
        .where(eq(tables.workspaceMember.id, id));
      return record ? transformIds(serializeMember(record), [], [], 'member') : null;
    }
    case 'invite': {
      const [record] = await db
        .select()
        .from(tables.workspaceInvite)
        .where(eq(tables.workspaceInvite.id, id));
      return record ? transformIds(serializeInvite(record), [], [], 'invite') : null;
    }
    default:
      return null;
  }
}
