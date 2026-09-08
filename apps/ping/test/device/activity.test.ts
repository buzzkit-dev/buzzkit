import { ACTIVITY_PUSH_INTERVAL_MS } from '@buzzkit/ping/api/sessions/index';
import type { ActivityConditions } from '@buzzkit/ping/device/index';
import { ACTIVITY_START_GRACE_MS, resolveActivityPush } from '@buzzkit/ping/device/index';
import { describe, expect, it } from 'vitest';
import { NOW } from '../utils/session';

function conditions(overrides: Partial<ActivityConditions> = {}): ActivityConditions {
  return {
    activityId: 'activity-1',
    activityStartedAt: NOW - 60_000,
    lastPushAt: NOW - 60_000,
    sessionCount: 1,
    now: NOW,
    force: false,
    ...overrides,
  };
}

describe('resolveActivityPush', () => {
  it('does nothing when there is no activity and nothing to show', () => {
    const decision = resolveActivityPush(conditions({ activityId: null, sessionCount: 0 }));

    expect(decision).toEqual({ action: 'none' });
  });

  it('ends the activity when the last session goes away', () => {
    const decision = resolveActivityPush(conditions({ sessionCount: 0 }));

    expect(decision).toEqual({ action: 'end', activityId: 'activity-1' });
  });

  it('starts an activity when sessions exist and none is running', () => {
    const decision = resolveActivityPush(conditions({ activityId: null, activityStartedAt: null }));

    expect(decision).toEqual({ action: 'start' });
  });

  it('waits instead of starting a second activity inside the grace window', () => {
    const startedAt = NOW - 1_000;
    const decision = resolveActivityPush(conditions({ activityId: null, activityStartedAt: startedAt }));

    expect(decision).toEqual({ action: 'wait', at: startedAt + ACTIVITY_START_GRACE_MS });
  });

  it('starts again once the grace window has passed without an id arriving', () => {
    const decision = resolveActivityPush(
      conditions({ activityId: null, activityStartedAt: NOW - ACTIVITY_START_GRACE_MS })
    );

    expect(decision).toEqual({ action: 'start' });
  });

  it('coalesces a routine update inside the push interval', () => {
    const lastPushAt = NOW - 100;
    const decision = resolveActivityPush(conditions({ lastPushAt }));

    expect(decision).toEqual({ action: 'wait', at: lastPushAt + ACTIVITY_PUSH_INTERVAL_MS });
  });

  it('lets a forced update through inside the push interval', () => {
    const decision = resolveActivityPush(conditions({ lastPushAt: NOW - 100, force: true }));

    expect(decision).toEqual({ action: 'update', activityId: 'activity-1' });
  });

  it('updates once the push interval has elapsed', () => {
    const decision = resolveActivityPush(conditions({ lastPushAt: NOW - ACTIVITY_PUSH_INTERVAL_MS }));

    expect(decision).toEqual({ action: 'update', activityId: 'activity-1' });
  });

  it('ends before considering the push interval', () => {
    const decision = resolveActivityPush(conditions({ sessionCount: 0, lastPushAt: NOW }));

    expect(decision).toEqual({ action: 'end', activityId: 'activity-1' });
  });
});
