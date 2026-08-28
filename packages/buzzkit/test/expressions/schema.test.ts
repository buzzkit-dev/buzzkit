import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ExpressionSchema, MAX_IN_VALUES } from '../../src/expressions/index';

const valid = (value: unknown) => Value.Check(ExpressionSchema, value);

describe('ExpressionSchema', () => {
  it('accepts every condition shape', () => {
    expect(valid({ ref: 'attributes.plan', eq: 'pro' })).toBe(true);
    expect(valid({ ref: 'externalId', in: ['a', 'b', null] })).toBe(true);
    expect(valid({ ref: 'attributes.age', gt: 18, lte: 65 })).toBe(true);
    expect(valid({ ref: 'attributes.city', contains: 'berl' })).toBe(true);
    expect(valid({ ref: 'attributes.nested.key', exists: false })).toBe(true);
    expect(valid({ count: 'workout.completed', within: '7d', gte: 3 })).toBe(true);
    expect(valid({ count: '$app.opened', eq: 0 })).toBe(true);
    expect(valid({ never: 'app.reviewed' })).toBe(true);
    expect(valid({ never: 'app.reviewed', within: '30d' })).toBe(true);
    expect(valid({ lastSeen: { within: '30d' } })).toBe(true);
    expect(valid({ lastSeen: { olderThan: '90d' } })).toBe(true);
    expect(valid({ channel: 'push' })).toBe(true);
    expect(valid({ channel: 'email' })).toBe(true);
  });

  it('accepts groups nested arbitrarily', () => {
    expect(
      valid({
        all: [
          { any: [{ channel: 'push' }, { not: { all: [{ never: 'a' }, { lastSeen: { within: '1h' } }] } }] },
          { ref: 'attributes.plan', neq: 'free' },
        ],
      })
    ).toBe(true);
    expect(valid({ all: [] })).toBe(false);
    expect(valid({ any: [] })).toBe(false);
  });

  it('rejects unknown keys and unknown node shapes', () => {
    expect(valid({ ref: 'attributes.plan', eq: 'pro', extra: true })).toBe(false);
    expect(valid({ count: 'a', gte: 1, ref: 'attributes.plan' })).toBe(false);
    expect(valid({ channel: 'push', within: '1d' })).toBe(false);
    expect(valid({ lastSeen: { within: '30d', since: '1d' } })).toBe(false);
    expect(valid({ matches: 'everyone' })).toBe(false);
    expect(valid({})).toBe(false);
    expect(valid('push')).toBe(false);
    expect(valid(null)).toBe(false);
    expect(valid({ all: {} })).toBe(false);
    expect(valid({ not: [{ channel: 'push' }] })).toBe(false);
  });

  it('rejects malformed refs, names, durations and channels', () => {
    expect(valid({ ref: 'Attributes.plan', eq: 'pro' })).toBe(false);
    expect(valid({ ref: '', eq: 'pro' })).toBe(false);
    expect(valid({ ref: `attributes.${'a'.repeat(200)}`, eq: 'pro' })).toBe(false);
    expect(valid({ ref: "attributes.plan' OR 1=1", eq: 'pro' })).toBe(false);
    expect(valid({ count: 'Workout', gte: 1 })).toBe(false);
    expect(valid({ count: "a' OR 1", gte: 1 })).toBe(false);
    expect(valid({ count: 'a', within: '1w', gte: 1 })).toBe(false);
    expect(valid({ never: 'a', within: '1' })).toBe(false);
    expect(valid({ lastSeen: { within: '1 day' } })).toBe(false);
    expect(valid({ channel: 'fax' })).toBe(false);
  });

  it('types the comparators', () => {
    expect(valid({ count: 'a', gte: '3' })).toBe(false);
    expect(valid({ count: 'a', gte: -1 })).toBe(false);
    expect(valid({ count: 'a', gte: 1.5 })).toBe(false);
    expect(valid({ ref: 'attributes.plan', gt: true })).toBe(false);
    expect(valid({ ref: 'attributes.plan', in: [] })).toBe(false);
    expect(valid({ ref: 'attributes.plan', in: Array.from({ length: MAX_IN_VALUES }, (_, i) => i) })).toBe(
      true
    );
    expect(
      valid({ ref: 'attributes.plan', in: Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => i) })
    ).toBe(false);
    expect(valid({ ref: 'attributes.plan', contains: '' })).toBe(false);
    expect(valid({ ref: 'attributes.plan', exists: 'yes' })).toBe(false);
    expect(valid({ ref: 'attributes.plan', eq: { nested: true } })).toBe(false);
  });
});

describe('ExpressionSchema limits', () => {
  it('bounds durations to five digits and known units', () => {
    expect(valid({ never: 'a', within: '99999d' })).toBe(true);
    expect(valid({ never: 'a', within: '100000d' })).toBe(false);
    expect(valid({ never: 'a', within: '1s' })).toBe(false);
    expect(valid({ never: 'a', within: '1D' })).toBe(false);
  });

  it('bounds event names and refs', () => {
    expect(valid({ count: `a${'b'.repeat(99)}`, gte: 1 })).toBe(true);
    expect(valid({ count: `a${'b'.repeat(100)}`, gte: 1 })).toBe(false);
    expect(valid({ count: '$app.opened', gte: 1 })).toBe(true);
    expect(valid({ count: '$$app', gte: 1 })).toBe(false);
    expect(valid({ ref: `a${'b'.repeat(199)}`, eq: 1 })).toBe(true);
    expect(valid({ ref: `a${'b'.repeat(200)}`, eq: 1 })).toBe(false);
    expect(valid({ ref: '$country', eq: 'DE' })).toBe(true);
  });

  it('lets several comparators sit on one condition', () => {
    expect(valid({ ref: 'attributes.age', gte: 18, lte: 65, exists: true })).toBe(true);
    expect(valid({ count: 'a', gt: 1, lt: 5 })).toBe(true);
    expect(valid({ lastSeen: { within: '30d', olderThan: '1d' } })).toBe(true);
  });

  it('accepts deep nesting and rejects a group with a bare scalar', () => {
    let nested: unknown = { channel: 'push' };
    for (let level = 0; level < 20; level += 1) nested = { not: nested };
    expect(valid(nested)).toBe(true);
    expect(valid({ all: ['push'] })).toBe(false);
    expect(valid({ any: [{ all: [{ ref: 'attributes.a', eq: 1 }] }, { not: { never: 'b' } }] })).toBe(true);
  });
});
