import { ACTIVITY_PUSH_INTERVAL_MS } from '@buzzkit/ping/api/sessions/index';
import { ACTIVITY_START_GRACE_MS } from './constants';

export type ActivityDecision =
  | { action: 'none' }
  | { action: 'start' }
  | { action: 'update'; activityId: string }
  | { action: 'end'; activityId: string }
  | { action: 'wait'; at: number };

export type ActivityConditions = {
  activityId: string | null;
  activityStartedAt: number | null;
  lastPushAt: number;
  sessionCount: number;
  now: number;
  force: boolean;
};

export function resolveActivityPush(conditions: ActivityConditions): ActivityDecision {
  const { activityId, activityStartedAt, lastPushAt, sessionCount, now, force } = conditions;

  if (sessionCount === 0) {
    return activityId ? { action: 'end', activityId } : { action: 'none' };
  }

  if (!activityId) {
    const grace = activityStartedAt === null ? null : activityStartedAt + ACTIVITY_START_GRACE_MS;
    if (grace !== null && now < grace) return { action: 'wait', at: grace };

    return { action: 'start' };
  }

  const ready = lastPushAt + ACTIVITY_PUSH_INTERVAL_MS;
  if (!force && now < ready) return { action: 'wait', at: ready };

  return { action: 'update', activityId };
}
