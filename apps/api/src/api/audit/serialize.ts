import { ID_PREFIXES, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import type { AuditRow } from './types';

export function serializeAuditEvent(row: AuditRow) {
  const entity = row.targetType ? TARGET_ENTITIES[row.targetType] : undefined;

  return {
    id: row.id,
    event: row.event,
    tenantId: row.tenantId,
    actorType: row.actorType,
    actorDisplay: row.actorDisplay,
    actorMemberId: row.actorMemberId,
    actorKeyId: row.actorKeyId,
    targetType: row.targetType,
    targetId:
      row.targetId && entity && !row.targetId.includes('_')
        ? `${ID_PREFIXES[entity]}_${row.targetId}`
        : row.targetId,
    data: row.data,
    requestId: row.requestId,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}
