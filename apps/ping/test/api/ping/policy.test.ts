import type { DeliveryConditions } from '@buzzkit/ping/api/ping/index';
import { resolveDeliveryPolicy } from '@buzzkit/ping/api/ping/index';
import { describe, expect, it } from 'vitest';

function conditions(overrides: Partial<DeliveryConditions> = {}): DeliveryConditions {
  return {
    kind: 'session',
    session: 'buzzkit/ts-sdk',
    status: 'working',
    statusChanged: false,
    silent: false,
    present: false,
    hasActivity: false,
    ...overrides,
  };
}

describe('resolveDeliveryPolicy', () => {
  it('stays silent for session progress while a Live Activity is carrying it', () => {
    const policy = resolveDeliveryPolicy(conditions({ hasActivity: true }));

    expect(policy.notify).toBe(false);
  });

  it('falls back to a collapsing banner when there is no Live Activity', () => {
    const policy = resolveDeliveryPolicy(conditions());

    expect(policy.notify).toBe(true);
    expect(policy.collapseId).toBe('buzzkit/ts-sdk');
    expect(policy.threadId).toBe('buzzkit/ts-sdk');
  });

  it('keeps repeated progress on the same session quiet', () => {
    const policy = resolveDeliveryPolicy(conditions({ statusChanged: false }));

    expect(policy.interruptionLevel).toBe('passive');
  });

  it('breaks through when the status changes', () => {
    const policy = resolveDeliveryPolicy(conditions({ statusChanged: true }));

    expect(policy.interruptionLevel).toBe('active');
  });

  it('breaks through when work finishes even without a status change', () => {
    const policy = resolveDeliveryPolicy(conditions({ status: 'done' }));

    expect(policy.interruptionLevel).toBe('active');
  });

  it('sends nothing while the human is present', () => {
    const policy = resolveDeliveryPolicy(conditions({ status: 'done', present: true }));

    expect(policy.notify).toBe(false);
  });

  it('suppresses a plain notification while the human is present', () => {
    const policy = resolveDeliveryPolicy(conditions({ kind: 'notification', session: null, present: true }));

    expect(policy.notify).toBe(false);
  });

  it('honours silent on a plain notification', () => {
    const policy = resolveDeliveryPolicy(conditions({ kind: 'notification', session: null, silent: true }));

    expect(policy.interruptionLevel).toBe('passive');
  });

  it('never groups a plain notification, which has no session to collapse onto', () => {
    const policy = resolveDeliveryPolicy(conditions({ kind: 'notification', session: null }));

    expect(policy.collapseId).toBeNull();
    expect(policy.threadId).toBeNull();
    expect(policy.interruptionLevel).toBe('active');
  });
});
