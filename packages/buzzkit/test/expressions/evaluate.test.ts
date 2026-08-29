import { describe, expect, it } from 'vitest';
import { evaluateExpression, resolvePath, UnsupportedConditionError } from '../../src/expressions/index';

const context = {
  trigger: { data: { plan: 'monthly', checks: 3, tags: ['a'], nested: { deep: true } } },
  subscriber: { externalId: 'user_42', attributes: { city: 'Berlin', age: 34 } },
  steps: { cancel: { matched: false } },
};

const resolve = (ref: string) => resolvePath(context, ref);

describe('evaluateExpression', () => {
  it('compares refs with every comparator and treats missing keys as absent', () => {
    expect(evaluateExpression({ ref: 'trigger.data.plan', eq: 'monthly' }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.plan', neq: 'yearly' }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.missing', neq: 'yearly' }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.missing', eq: 'yearly' }, resolve)).toBe(false);
    expect(evaluateExpression({ ref: 'trigger.data.checks', gt: 2, lte: 3 }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.checks', gte: 4 }, resolve)).toBe(false);
    expect(evaluateExpression({ ref: 'subscriber.attributes.city', contains: 'BER' }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'subscriber.attributes.city', in: ['Paris', 'Berlin'] }, resolve)).toBe(
      true
    );
    expect(evaluateExpression({ ref: 'trigger.data.nested.deep', exists: true }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.nope', exists: false }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'steps.cancel.matched', eq: false }, resolve)).toBe(true);
    expect(evaluateExpression({ ref: 'subscriber.attributes.age', lt: '40' }, resolve)).toBe(false);
  });

  it('combines groups', () => {
    expect(
      evaluateExpression(
        {
          all: [
            { ref: 'trigger.data.plan', eq: 'monthly' },
            {
              any: [
                { ref: 'trigger.data.checks', gte: 10 },
                { not: { ref: 'steps.cancel.matched', eq: true } },
              ],
            },
          ],
        },
        resolve
      )
    ).toBe(true);
  });

  it('refuses conditions that need the stream', () => {
    expect(() => evaluateExpression({ count: 'a', gte: 1 }, resolve)).toThrow(UnsupportedConditionError);
  });
});
