import { describe, expect, it } from 'vitest';
import { expressionProblem, isExpression } from '../../src/expressions/index';

describe('isExpression', () => {
  it('accepts a well-formed expression and rejects anything else', () => {
    expect(isExpression({ all: [{ channel: 'push' }, { count: 'a', gte: 1 }] })).toBe(true);
    expect(isExpression({ channel: 'fax' })).toBe(false);
    expect(isExpression({ all: [] })).toBe(false);
    expect(isExpression({ ref: 'attributes.plan' })).toBe(false);
    expect(isExpression('push')).toBe(false);
    expect(isExpression(null)).toBe(false);
  });
});

describe('expressionProblem', () => {
  it('is null for a valid expression', () => {
    expect(expressionProblem({ lastSeen: { within: '30d' } })).toBeNull();
  });

  it('names what is wrong and where', () => {
    expect(expressionProblem({ all: [{ channel: 'fax' }] })).toBe(
      '"channel" must be one of "push", "email", "sms", got "fax". (all[0].channel)'
    );
    expect(expressionProblem({ all: [] })).toBe('"all" needs at least one condition. (all)');
    expect(expressionProblem({ all: [{ lastSeen: {} }] })).toBe(
      '"lastSeen" needs "within" or "olderThan", such as { "within": "30d" }. (all[0].lastSeen)'
    );
    expect(expressionProblem(42)).toMatch(/must be an object/);
  });
});
