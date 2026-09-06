import { describe, expect, it } from 'vitest';
import { describeStreamEvent } from '@/app/components/events/stream';

describe('describeStreamEvent', () => {
  it('reads a merge as the identity it came from', () => {
    expect(
      describeStreamEvent({
        name: '$subscriber.merged',
        data: { externalId: 'user_42', from: 'anon_9RmZ0hVQb2xKcT4wLpN7s' },
      })
    ).toEqual({
      label: 'Identity merged',
      icon: 'IconPeopleEditFilled',
      detail: 'anon_9RmZ0hVQb2xKcT4wLpN7s',
    });
  });

  it('reads a deliberate link as the alias that was added', () => {
    expect(
      describeStreamEvent({
        name: '$subscriber.aliased',
        data: { externalId: 'user_42', alias: 'onesignal:8f2c1a' },
      })
    ).toEqual({
      label: 'Alias added',
      icon: 'IconChainLink4',
      detail: 'onesignal:8f2c1a',
    });
  });

  it('leaves identifiers exactly as they are, and only sentences real prose', () => {
    expect(describeStreamEvent({ name: '$subscriber.merged', data: { from: 'anon_lower' } }).detail).toBe(
      'anon_lower'
    );
    expect(
      describeStreamEvent({
        name: '$subscription.registered',
        data: { channel: 'email', endpoint: 'maya@acme.com' },
      }).detail
    ).toBe('maya@acme.com');
    expect(
      describeStreamEvent({ name: '$deeplink.opened', data: { url: 'app://workouts/legs' } }).detail
    ).toBe('app://workouts/legs');
    expect(describeStreamEvent({ name: '$permission.changed', data: { status: 'provisional' } }).detail).toBe(
      'Provisional'
    );
  });

  it('names the id a subscriber was created under, so an anonymous one is obvious', () => {
    expect(
      describeStreamEvent({
        name: '$subscriber.created',
        data: { externalId: 'anon_9a934b3682c840a780f28', attributes: { plan: 'pro' } },
      })
    ).toEqual({
      label: 'Subscriber created',
      icon: 'IconUserAddFilled',
      detail: 'anon_9a934b3682c840a780f28',
    });
  });

  it('falls back to the raw name for an event it does not know', () => {
    expect(describeStreamEvent({ name: 'workout.completed', data: {} })).toEqual({
      label: 'workout.completed',
      icon: 'IconZapFilled',
      detail: null,
    });
  });

  it('survives data that is missing or not an object', () => {
    expect(describeStreamEvent({ name: '$subscriber.merged', data: null }).detail).toBeNull();
    expect(describeStreamEvent({ name: '$subscriber.aliased', data: 'nope' }).detail).toBeNull();
  });
});
