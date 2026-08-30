import { type EvaluateOptions, evaluateExpression, resolvePath } from '@buzzkit/api/actor/evaluate';
import { describe, expect, it } from 'vitest';

const context = {
  trigger: { data: { plan: 'monthly', checks: 3, tags: ['a'], nested: { deep: true } } },
  subscriber: { externalId: 'user_42', attributes: { city: 'Berlin', age: 34 } },
  steps: { cancel: { matched: false } },
};

const resolve = (ref: string) => resolvePath(context, ref);

const empty: EvaluateOptions = {
  history: { count: () => 0, opened: () => false, delivered: () => false },
  now: new Date('2026-08-29T12:00:00.000Z'),
  since: { trigger: '2026-08-29T10:00:00.000Z', localMidnight: '2026-08-28T22:00:00.000Z' },
};

describe('evaluateExpression', () => {
  it('compares refs with every comparator and treats missing keys as absent', () => {
    expect(evaluateExpression({ ref: 'trigger.data.plan', eq: 'monthly' }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.plan', neq: 'yearly' }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.missing', neq: 'yearly' }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.missing', eq: 'yearly' }, resolve, empty)).toBe(false);
    expect(evaluateExpression({ ref: 'trigger.data.checks', gt: 2, lte: 3 }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.checks', gte: 4 }, resolve, empty)).toBe(false);
    expect(evaluateExpression({ ref: 'subscriber.attributes.city', contains: 'BER' }, resolve, empty)).toBe(
      true
    );
    expect(
      evaluateExpression({ ref: 'subscriber.attributes.city', in: ['Paris', 'Berlin'] }, resolve, empty)
    ).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.nested.deep', exists: true }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'trigger.data.nope', exists: false }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'steps.cancel.matched', eq: false }, resolve, empty)).toBe(true);
    expect(evaluateExpression({ ref: 'subscriber.attributes.age', lt: '40' }, resolve, empty)).toBe(false);
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
        resolve,
        empty
      )
    ).toBe(true);
  });

  it('answers history conditions through a resolver with windows from now, the trigger or local midnight', () => {
    const calls: Array<[string, string | null]> = [];
    const options: EvaluateOptions = {
      ...empty,
      history: {
        count: (event, window) => {
          calls.push([event, window.from]);
          return event === 'workout.completed' ? 3 : 0;
        },
        opened: (step) => step === 'nudge',
        delivered: (step) => step === 'nudge' || step === 'bye',
      },
    };
    expect(evaluateExpression({ count: 'workout.completed', within: '7d', gte: 3 }, resolve, options)).toBe(
      true
    );
    expect(
      evaluateExpression({ count: 'workout.completed', since: 'trigger', gt: 3 }, resolve, options)
    ).toBe(false);
    expect(evaluateExpression({ count: 'workout.completed', eq: 3 }, resolve, options)).toBe(true);
    expect(
      evaluateExpression({ occurred: 'workout.completed', since: 'localMidnight' }, resolve, options)
    ).toBe(true);
    expect(evaluateExpression({ occurred: 'app.reviewed', within: '30d' }, resolve, options)).toBe(false);
    expect(evaluateExpression({ never: 'app.reviewed', within: '30d' }, resolve, options)).toBe(true);
    expect(evaluateExpression({ never: 'workout.completed' }, resolve, options)).toBe(false);
    expect(evaluateExpression({ opened: 'nudge' }, resolve, options)).toBe(true);
    expect(evaluateExpression({ not: { opened: 'bye' } }, resolve, options)).toBe(true);
    expect(evaluateExpression({ delivered: 'bye' }, resolve, options)).toBe(true);
    expect(calls).toEqual([
      ['workout.completed', '2026-08-22T12:00:00.000Z'],
      ['workout.completed', '2026-08-29T10:00:00.000Z'],
      ['workout.completed', null],
      ['workout.completed', '2026-08-28T22:00:00.000Z'],
      ['app.reviewed', '2026-07-30T12:00:00.000Z'],
      ['app.reviewed', '2026-07-30T12:00:00.000Z'],
      ['workout.completed', null],
    ]);
    expect(evaluateExpression({ count: 'a', gte: 1 }, resolve, empty)).toBe(false);
    expect(evaluateExpression({ never: 'a' }, resolve, empty)).toBe(true);
  });
});
