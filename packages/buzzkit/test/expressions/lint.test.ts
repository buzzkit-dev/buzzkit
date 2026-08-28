import { describe, expect, it } from 'vitest';
import {
  type Expression,
  ExpressionSchema,
  formatExpressionPath,
  isExpression,
  lintExpression,
} from '../../src/expressions/index';

const messages = (value: unknown) =>
  lintExpression(value).map((issue) => `${formatExpressionPath(issue.path)}: ${issue.message}`);

describe('lintExpression', () => {
  it('passes everything the schema accepts', () => {
    const valid: Expression[] = [
      { ref: 'attributes.plan', eq: 'pro' },
      { ref: 'externalId', in: ['a', 'b', null] },
      { ref: 'attributes.age', gt: 18, lte: 65 },
      { ref: 'attributes.city', contains: 'berl' },
      { ref: 'attributes.nested.key', exists: false },
      { count: 'workout.completed', within: '7d', gte: 3 },
      { count: '$app.opened', eq: 0 },
      { never: 'app.reviewed' },
      { never: 'app.reviewed', within: '30d' },
      { lastSeen: { within: '30d' } },
      { lastSeen: { olderThan: '90d' } },
      { channel: 'push' },
      {
        all: [
          { any: [{ channel: 'push' }, { not: { all: [{ never: 'a' }, { lastSeen: { within: '1h' } }] } }] },
        ],
      },
    ];
    for (const expression of valid) {
      expect(lintExpression(expression), JSON.stringify(expression)).toEqual([]);
      expect(isExpression(expression)).toBe(true);
    }
  });

  it('finds an issue for everything the schema rejects', () => {
    const invalid: unknown[] = [
      null,
      'push',
      {},
      { matches: 'everyone' },
      { all: {} },
      { all: [] },
      { not: [{ channel: 'push' }] },
      { ref: 'attributes.plan' },
      { ref: 'Attributes.plan', eq: 'pro' },
      { ref: "attributes.plan' OR 1=1", eq: 'pro' },
      { ref: 'attributes.plan', eq: 'pro', extra: true },
      { ref: 'attributes.plan', in: [] },
      { ref: 'attributes.plan', in: Array.from({ length: 101 }, (_, i) => i) },
      { ref: 'attributes.plan', contains: '' },
      { ref: 'attributes.plan', exists: 'yes' },
      { ref: 'attributes.plan', eq: { nested: true } },
      { ref: 'attributes.plan', gt: true },
      { count: 'Workout', gte: 1 },
      { count: 'a', gte: '3' },
      { count: 'a', gte: -1 },
      { count: 'a', gte: 1.5 },
      { count: 'a', within: '1w', gte: 1 },
      { count: 'a', within: '7d' },
      { never: 'a', within: '1' },
      { lastSeen: {} },
      { lastSeen: { within: '1 day' } },
      { lastSeen: { within: '30d', since: '1d' } },
      { channel: 'fax' },
      { channel: 'push', within: '1d' },
      { count: 'a', gte: 1, ref: 'attributes.plan' },
    ];
    for (const value of invalid) {
      expect(lintExpression(value).length, JSON.stringify(value)).toBeGreaterThan(0);
      expect(isExpression(value), JSON.stringify(value)).toBe(false);
    }
  });

  it('names the key and the path, and says what is allowed', () => {
    expect(
      messages({ all: [{ channel: 'push' }, { count: 'order.completed', within: '30 days', gte: 1 }] })
    ).toEqual([
      'all[1].within: "30 days" is not a duration. Use a number followed by m, h or d, such as "15m", "12h" or "30d".',
    ]);
    expect(messages({ ref: 'attributes.plan', equals: 'pro' })).toEqual([
      'equals: "equals" is not a key of an attribute condition. Allowed keys: "ref", "eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists".',
      'the expression: An attribute condition needs a comparison: one of "eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists".',
    ]);
    expect(messages({ any: [{ event: 'order.completed' }] })).toEqual([
      'any[0]: This object is neither a group nor a condition. Start it with one of "all", "any", "not" or "ref", "count", "never", "lastSeen", "channel".',
    ]);
    expect(messages({ all: [{ channel: 'sms ' }] })).toEqual([
      'all[0].channel: "channel" must be one of "push", "email", "sms", got "sms ".',
    ]);
    expect(messages({ count: 'order.completed', gte: '2' })).toEqual([
      'gte: "gte" takes a whole number of times, 0 or more, got "2".',
    ]);
    expect(messages({ ref: 'email', eq: 'a@b.c' })).toEqual([
      'ref: "email" is not something a segment can filter on. Use "attributes.<key>" for an attribute or "externalId".',
    ]);
    expect(messages({ all: [{ ref: 'attributes.plan', eq: 'pro' }, 'push'] })).toEqual([
      'all[1]: This must be an object: a group ({ "all": [...] }, { "any": [...] }, { "not": {...} }) or a condition, got "push".',
    ]);
  });

  it('reports several problems at once', () => {
    const issues = lintExpression({
      all: [{ ref: 'attributes.plan' }, { count: 'Order', gte: -1 }, { lastSeen: {} }, { channel: 'fax' }],
    });
    expect(issues.map((issue) => formatExpressionPath(issue.path))).toEqual([
      'all[0]',
      'all[1].count',
      'all[1].gte',
      'all[2].lastSeen',
      'all[3].channel',
    ]);
  });

  it('caps depth and conditions', () => {
    let nested: Expression = { channel: 'push' };
    for (let level = 0; level < 8; level += 1) nested = { all: [nested] };
    expect(messages(nested)[0]).toMatch(/nest at most 8 levels/);
    const many = { all: Array.from({ length: 51 }, () => ({ channel: 'push' })) };
    expect(messages(many)).toEqual(['all[50]: An expression holds at most 50 conditions.']);
  });
});
