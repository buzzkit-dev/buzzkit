import { acceptEvent } from '@buzzkit/api/actor/ingest';
import { selectQuietAnchor } from '@buzzkit/api/actor/quiet';
import type { ActorEventInput, ActorIdentity } from '@buzzkit/api/actor/types';
import { describe, expect, it } from 'vitest';
import { createActorStore } from '../utils/actorStore';

const identity: ActorIdentity = { tenantId: 1, subscriberId: 2, externalId: 'user_2' };

function event(name: string, timestamp: string, data: Record<string, unknown> = {}): ActorEventInput {
  return {
    id: `${name}@${timestamp}`,
    idempotencyKey: null,
    name,
    source: 'ios',
    timestamp,
    receivedAt: timestamp,
    data,
  };
}

describe('selectQuietAnchor', () => {
  it('returns nothing before the event ever happened', () => {
    const { store } = createActorStore();
    expect(selectQuietAnchor(store, identity, '$app.backgrounded', [], 'UTC')).toBeNull();
  });

  it('returns the latest occurrence with its data when no reset came after it', () => {
    const { store } = createActorStore();
    acceptEvent(store, event('$app.opened', '2026-08-27T09:00:00.000Z'));
    acceptEvent(store, event('$app.backgrounded', '2026-08-27T09:10:00.000Z', { screen: 'cart' }));

    expect(
      selectQuietAnchor(store, identity, '$app.backgrounded', [{ event: '$app.opened' }], 'UTC')
    ).toEqual({
      name: '$app.backgrounded',
      dataJson: JSON.stringify({ screen: 'cart' }),
      timestamp: '2026-08-27T09:10:00.000Z',
      id: '$app.backgrounded@2026-08-27T09:10:00.000Z',
    });
  });

  it('is reset by a later occurrence of an unconditional reset event', () => {
    const { store } = createActorStore();
    acceptEvent(store, event('$app.backgrounded', '2026-08-27T09:10:00.000Z'));
    acceptEvent(store, event('$app.opened', '2026-08-27T09:12:00.000Z'));

    expect(
      selectQuietAnchor(store, identity, '$app.backgrounded', [{ event: '$app.opened' }], 'UTC')
    ).toBeNull();
    expect(
      selectQuietAnchor(
        store,
        identity,
        '$app.backgrounded',
        ['$app.opened'].map((name) => ({ event: name })),
        'UTC'
      )
    ).toBeNull();
  });

  it('only counts a conditional reset event whose condition holds', () => {
    const { store } = createActorStore();
    acceptEvent(store, event('$app.backgrounded', '2026-08-27T09:10:00.000Z'));
    acceptEvent(store, event('$app.opened', '2026-08-27T09:12:00.000Z', { screen: 'widget' }));
    const unless = [{ event: '$app.opened', where: { ref: 'event.data.screen', neq: 'widget' } }];

    expect(selectQuietAnchor(store, identity, '$app.backgrounded', unless, 'UTC')?.timestamp).toBe(
      '2026-08-27T09:10:00.000Z'
    );

    acceptEvent(store, event('$app.opened', '2026-08-27T09:13:00.000Z', { screen: 'home' }));
    expect(selectQuietAnchor(store, identity, '$app.backgrounded', unless, 'UTC')).toBeNull();
  });

  it('ignores conditional reset events from before the anchor', () => {
    const { store } = createActorStore();
    acceptEvent(store, event('$app.opened', '2026-08-27T09:00:00.000Z', { screen: 'home' }));
    acceptEvent(store, event('$app.backgrounded', '2026-08-27T09:10:00.000Z'));
    const unless = [{ event: '$app.opened', where: { ref: 'event.data.screen', eq: 'home' } }];

    expect(selectQuietAnchor(store, identity, '$app.backgrounded', unless, 'UTC')?.timestamp).toBe(
      '2026-08-27T09:10:00.000Z'
    );
  });

  it('reads subscriber attributes and history inside a reset condition', () => {
    const { store } = createActorStore();
    store.writeAttributes({ plan: 'pro' });
    acceptEvent(store, event('$app.backgrounded', '2026-08-27T09:10:00.000Z'));
    acceptEvent(store, event('$app.opened', '2026-08-27T09:12:00.000Z'));

    const proOnly = [{ event: '$app.opened', where: { ref: 'subscriber.attributes.plan', eq: 'pro' } }];
    expect(selectQuietAnchor(store, identity, '$app.backgrounded', proOnly, 'UTC')).toBeNull();
    const freeOnly = [{ event: '$app.opened', where: { ref: 'subscriber.attributes.plan', eq: 'free' } }];
    expect(selectQuietAnchor(store, identity, '$app.backgrounded', freeOnly, 'UTC')).not.toBeNull();
    const twice = [{ event: '$app.opened', where: { count: '$app.opened', gte: 2 } }];
    expect(selectQuietAnchor(store, identity, '$app.backgrounded', twice, 'UTC')).not.toBeNull();
  });
});
