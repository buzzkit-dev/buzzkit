import { encodeId } from '@buzzkit/api/libs/sqids';
import type { LiveActivity } from './types';

export function serializeLiveActivity(activity: LiveActivity) {
  return {
    id: encodeId('liveActivity', activity.id),
    kind: activity.kind,
    activityId: activity.activityId,
    attributesType: activity.attributesType,
    environment: activity.environment,
    endedAt: activity.endedAt,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}
