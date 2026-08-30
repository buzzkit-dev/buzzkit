import { evaluateExpression } from '@buzzkit/api/actor/evaluate';
import { historyOptions, historyResolver, subscriberTimezone } from '@buzzkit/api/actor/history';
import { acceptEvent, systemEvent } from '@buzzkit/api/actor/ingest';
import type { ActorEventInput } from '@buzzkit/api/actor/types';
import { describe, expect, it } from 'vitest';
import { createActorStore } from '../utils/actorStore';

function event(name: string, timestamp: string, data: Record<string, unknown> = {}): ActorEventInput {
  return {
    id: `evt_${name}_${timestamp}`,
    idempotencyKey: null,
    name,
    source: 'ios',
    timestamp,
    receivedAt: timestamp,
    data,
  };
}

function seeded() {
  const { store } = createActorStore();
  acceptEvent(store, event('workout.completed', '2026-08-20T10:00:00.000Z'));
  acceptEvent(store, event('workout.completed', '2026-08-28T10:00:00.000Z'));
  acceptEvent(store, event('workout.completed', '2026-08-29T09:00:00.000Z'));
  acceptEvent(
    store,
    systemEvent('$run.step', { step: 'nudge' }, { runId: 'run_1', step: 'nudge', messageId: 'msg_1' })
  );
  acceptEvent(store, event('$notification.opened', '2026-08-29T09:30:00.000Z', { messageId: 'msg_1' }));
  acceptEvent(store, event('$notification.delivered', '2026-08-29T09:31:00.000Z', { messageId: 'msg_2' }));
  return store;
}

describe('historyResolver', () => {
  it('counts events from an instant and finds the opens and deliveries of a step', () => {
    const resolver = historyResolver(seeded(), 'run_1');
    expect(resolver.count('workout.completed', { from: null })).toBe(3);
    expect(resolver.count('workout.completed', { from: '2026-08-28T00:00:00.000Z' })).toBe(2);
    expect(resolver.count('app.reviewed', { from: null })).toBe(0);
    expect(resolver.opened('nudge')).toBe(true);
    expect(resolver.delivered('nudge')).toBe(false);
    expect(resolver.opened('bye')).toBe(false);
    expect(historyResolver(seeded(), null).opened('nudge')).toBe(false);
  });
});

describe('historyOptions', () => {
  it('anchors windows on the run start and the local midnight of the subscriber', () => {
    const store = seeded();
    const options = historyOptions(
      store,
      { run_id: 'run_1', started_at: '2026-08-29T08:30:00.000Z' },
      'Europe/Berlin',
      new Date('2026-08-29T10:00:00.000Z')
    );
    expect(options.since).toEqual({
      trigger: '2026-08-29T08:30:00.000Z',
      localMidnight: '2026-08-28T22:00:00.000Z',
    });
    const resolve = () => undefined;
    expect(
      evaluateExpression({ count: 'workout.completed', since: 'trigger', eq: 1 }, resolve, options)
    ).toBe(true);
    expect(
      evaluateExpression({ count: 'workout.completed', since: 'localMidnight', eq: 1 }, resolve, options)
    ).toBe(true);
    expect(evaluateExpression({ count: 'workout.completed', within: '7d', eq: 2 }, resolve, options)).toBe(
      true
    );
    expect(evaluateExpression({ occurred: 'workout.completed', since: 'trigger' }, resolve, options)).toBe(
      true
    );
    expect(evaluateExpression({ never: 'app.reviewed' }, resolve, options)).toBe(true);
    expect(
      evaluateExpression({ all: [{ opened: 'nudge' }, { not: { delivered: 'nudge' } }] }, resolve, options)
    ).toBe(true);
    expect(historyOptions(store, null, 'UTC', new Date('2026-08-29T10:00:00.000Z')).since).toEqual({
      trigger: '2026-08-29T10:00:00.000Z',
      localMidnight: '2026-08-29T00:00:00.000Z',
    });
  });
});

describe('subscriberTimezone', () => {
  it('prefers the subscriber, then the workflow default, then UTC', () => {
    expect(subscriberTimezone({ $timezone: 'Asia/Tokyo' }, 'Europe/Paris')).toBe('Asia/Tokyo');
    expect(subscriberTimezone({ $timezone: 'Mars/Olympus' }, 'Europe/Paris')).toBe('Europe/Paris');
    expect(subscriberTimezone({}, 'nope')).toBe('UTC');
    expect(subscriberTimezone({})).toBe('UTC');
  });
});
