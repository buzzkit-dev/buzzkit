import { encodeId } from '@buzzkit/api/libs/sqids';
import type { Message, MessageTargets } from './types';

function serializeTargets({ segmentVersionId, ...targets }: MessageTargets) {
  return {
    ...targets,
    ...(segmentVersionId === undefined
      ? {}
      : { segmentVersion: encodeId('segmentVersion', segmentVersionId) }),
  };
}

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    channel: message.channel,
    topic: message.topic,
    targets: serializeTargets(message.targets as MessageTargets),
    payload: message.payload,
    status: message.status,
    counts: {
      total: message.total,
      pending: Math.max(0, message.total - message.sent - message.failed - message.invalid),
      sent: message.sent,
      delivered: message.delivered,
      bounced: message.bounced,
      failed: message.failed,
      invalid: message.invalid,
    },
    idempotencyKey: message.idempotencyKey,
    schedule: message.schedule,
    scheduledFor: message.scheduledFor,
    canceledAt: message.canceledAt,
    expiresAt: message.expiresAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    completedAt: message.completedAt,
  };
}
