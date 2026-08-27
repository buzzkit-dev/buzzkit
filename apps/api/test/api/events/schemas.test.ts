import { MAX_EVENTS_PER_REQUEST } from '@buzzkit/api/api/events/constants';
import {
  ClientTrackEventsSchema,
  EventDataSchema,
  EventIdSchema,
  EventNameSchema,
  EventTimestampSchema,
  EventVolumeRangeSchema,
  TrackEventsSchema,
} from '@buzzkit/api/api/events/schemas';
import { TypeCompiler } from 'elysia/type-system';
import { describe, expect, it } from 'vitest';

const eventName = TypeCompiler.Compile(EventNameSchema);
const eventId = TypeCompiler.Compile(EventIdSchema);
const eventData = TypeCompiler.Compile(EventDataSchema);
const eventTimestamp = TypeCompiler.Compile(EventTimestampSchema);
const trackEvents = TypeCompiler.Compile(TrackEventsSchema);
const clientTrackEvents = TypeCompiler.Compile(ClientTrackEventsSchema);
const volumeRange = TypeCompiler.Compile(EventVolumeRangeSchema);

const event = (index: number) => ({ externalId: `user_${index}`, name: 'order.paid' });

describe('EventNameSchema', () => {
  it('accepts names between 1 and 100 characters', () => {
    expect(eventName.Check('a')).toBe(true);
    expect(eventName.Check('a'.repeat(100))).toBe(true);
    expect(eventName.Check('a'.repeat(101))).toBe(false);
    expect(eventName.Check('')).toBe(false);
  });

  it('counts the prefix towards the length', () => {
    expect(eventName.Check(`$${'a'.repeat(99)}`)).toBe(true);
    expect(eventName.Check(`$${'a'.repeat(100)}`)).toBe(false);
  });

  it('makes the prefix optional but never alone', () => {
    expect(eventName.Check('$app.opened')).toBe(true);
    expect(eventName.Check('app.opened')).toBe(true);
    expect(eventName.Check('$')).toBe(false);
    expect(eventName.Check('$$app')).toBe(false);
    expect(eventName.Check('app$')).toBe(false);
  });

  it('accepts digits, dots, dashes and underscores after the first character', () => {
    expect(eventName.Check('1')).toBe(true);
    expect(eventName.Check('123abc')).toBe(true);
    expect(eventName.Check('order.paid_v2-beta')).toBe(true);
    expect(eventName.Check('a.')).toBe(true);
    expect(eventName.Check('a-')).toBe(true);
  });

  it('rejects uppercase, whitespace, unicode and a leading dot or dash', () => {
    expect(eventName.Check('Order.paid')).toBe(false);
    expect(eventName.Check('order paid')).toBe(false);
    expect(eventName.Check('order\tpaid')).toBe(false);
    expect(eventName.Check('bestellung.bezählt')).toBe(false);
    expect(eventName.Check('订单')).toBe(false);
    expect(eventName.Check('.paid')).toBe(false);
    expect(eventName.Check('-paid')).toBe(false);
    expect(eventName.Check('_paid')).toBe(false);
    expect(eventName.Check('order/paid')).toBe(false);
    expect(eventName.Check('order:paid')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(eventName.Check(1)).toBe(false);
    expect(eventName.Check(null)).toBe(false);
    expect(eventName.Check(undefined)).toBe(false);
  });
});

describe('EventIdSchema', () => {
  it('accepts between 1 and 64 characters', () => {
    expect(eventId.Check('')).toBe(false);
    expect(eventId.Check('a')).toBe(true);
    expect(eventId.Check('x'.repeat(64))).toBe(true);
    expect(eventId.Check('x'.repeat(65))).toBe(false);
    expect(eventId.Check(1)).toBe(false);
  });
});

describe('EventDataSchema', () => {
  it('accepts an empty object and nested objects with any values', () => {
    expect(eventData.Check({})).toBe(true);
    expect(
      eventData.Check({ plan: 'pro', seats: 3, tags: ['a', 'b'], nested: { deep: { deeper: null } } })
    ).toBe(true);
  });

  it('rejects arrays, null, strings and numbers', () => {
    expect(eventData.Check([1])).toBe(false);
    expect(eventData.Check([])).toBe(false);
    expect(eventData.Check(null)).toBe(false);
    expect(eventData.Check('text')).toBe(false);
    expect(eventData.Check(1)).toBe(false);
  });
});

describe('EventTimestampSchema', () => {
  it('accepts RFC 3339 date-times and rejects everything else', () => {
    expect(eventTimestamp.Check('2026-08-27T12:00:00Z')).toBe(true);
    expect(eventTimestamp.Check('2026-08-27T12:00:00.123+02:00')).toBe(true);
    expect(eventTimestamp.Check('12:00:00Z')).toBe(false);
    expect(eventTimestamp.Check('27/08/2026')).toBe(false);
    expect(eventTimestamp.Check('2026-08-27T25:00:00Z')).toBe(false);
    expect(eventTimestamp.Check('yesterday')).toBe(false);
    expect(eventTimestamp.Check(1756296000000)).toBe(false);
  });
});

describe('EventTimestampSchema quirks', () => {
  it('lets a bare date and a space separator through the Elysia date-time format', () => {
    expect(eventTimestamp.Check('2026-08-27')).toBe(true);
    expect(eventTimestamp.Check('2026-08-27 12:00:00')).toBe(true);
  });
});

describe('TrackEventsSchema', () => {
  it('accepts a batch event with every optional field', () => {
    expect(
      trackEvents.Check({
        events: [
          {
            id: 'client-1',
            externalId: 'user_1',
            name: '$app.opened',
            timestamp: '2026-08-27T12:00:00Z',
            data: { plan: 'pro', nested: { deep: [1, 2] } },
          },
        ],
      })
    ).toBe(true);
  });

  it('rejects a bare single event, which only the route sugar accepts', () => {
    expect(trackEvents.Check(event(1))).toBe(false);
    expect(trackEvents.Check({ ...event(1), events: undefined })).toBe(false);
  });

  it('rejects a batch member missing externalId or name', () => {
    expect(trackEvents.Check({ events: [{ name: 'order.paid' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ externalId: 'user_1' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ externalId: '', name: 'order.paid' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ externalId: 'x'.repeat(257), name: 'order.paid' }] })).toBe(false);
  });

  it('accepts a batch between 1 and the maximum', () => {
    expect(trackEvents.Check({ events: [event(1)] })).toBe(true);
    expect(
      trackEvents.Check({ events: Array.from({ length: MAX_EVENTS_PER_REQUEST }, (_, i) => event(i)) })
    ).toBe(true);
  });

  it('rejects an empty batch and one over the maximum', () => {
    expect(trackEvents.Check({ events: [] })).toBe(false);
    expect(
      trackEvents.Check({ events: Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, i) => event(i)) })
    ).toBe(false);
  });

  it('rejects an unknown timestamp format', () => {
    expect(trackEvents.Check({ events: [{ ...event(1), timestamp: 'yesterday' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ ...event(1), timestamp: '27/08/2026' }] })).toBe(false);
  });

  it('rejects a batch member that fails the event rules', () => {
    expect(trackEvents.Check({ events: [event(1), { externalId: 'user_2', name: 'Order' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ ...event(1), id: '' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ ...event(1), data: 'text' }] })).toBe(false);
    expect(trackEvents.Check({ events: [{ ...event(1), data: [1] }] })).toBe(false);
  });
});

describe('ClientTrackEventsSchema', () => {
  const body = { externalId: 'user_1', source: 'ios', events: [{ name: '$app.opened' }] };

  it('accepts each client source', () => {
    for (const source of ['ios', 'android', 'web']) {
      expect(clientTrackEvents.Check({ ...body, source }), source).toBe(true);
    }
  });

  it('rejects the server and system sources and a missing source', () => {
    expect(clientTrackEvents.Check({ ...body, source: 'server' })).toBe(false);
    expect(clientTrackEvents.Check({ ...body, source: 'system' })).toBe(false);
    expect(clientTrackEvents.Check({ ...body, source: 'IOS' })).toBe(false);
    const { source, ...withoutSource } = body;
    expect(source).toBe('ios');
    expect(clientTrackEvents.Check(withoutSource)).toBe(false);
  });

  it('carries the identity hash optionally and bounds it', () => {
    expect(clientTrackEvents.Check({ ...body, identityHash: 'a'.repeat(128) })).toBe(true);
    expect(clientTrackEvents.Check({ ...body, identityHash: 'a'.repeat(129) })).toBe(false);
  });

  it('bounds the batch and validates each event', () => {
    expect(clientTrackEvents.Check({ ...body, events: [] })).toBe(false);
    expect(
      clientTrackEvents.Check({
        ...body,
        events: Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => ({ name: 'tap' })),
      })
    ).toBe(false);
    expect(
      clientTrackEvents.Check({
        ...body,
        events: Array.from({ length: MAX_EVENTS_PER_REQUEST }, () => ({ name: 'tap' })),
      })
    ).toBe(true);
    expect(clientTrackEvents.Check({ ...body, events: [{ name: 'Tap' }] })).toBe(false);
    expect(clientTrackEvents.Check({ ...body, events: [{ name: 'tap', timestamp: 'now' }] })).toBe(false);
  });
});

describe('EventVolumeRangeSchema', () => {
  it('accepts the three ranges only', () => {
    expect(volumeRange.Check('24h')).toBe(true);
    expect(volumeRange.Check('7d')).toBe(true);
    expect(volumeRange.Check('30d')).toBe(true);
    expect(volumeRange.Check('1h')).toBe(false);
    expect(volumeRange.Check('90d')).toBe(false);
    expect(volumeRange.Check('')).toBe(false);
    expect(volumeRange.Check(7)).toBe(false);
  });
});
