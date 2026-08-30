import {
  assertExpressionShape,
  ExpressionError,
  kindOf,
  listReferencedEvents,
} from '@buzzkit/api/api/segments/validate';
import { type Expression, MAX_EXPRESSION_DEPTH, MAX_EXPRESSION_LEAVES } from 'buzzkit/expressions';
import { describe, expect, it } from 'vitest';

function failure(expression: Expression): ExpressionError {
  let thrown: unknown;
  try {
    assertExpressionShape(expression);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ExpressionError);
  return thrown as ExpressionError;
}

describe('kindOf', () => {
  it('names every node shape', () => {
    expect(kindOf({ all: [] })).toBe('all');
    expect(kindOf({ any: [] })).toBe('any');
    expect(kindOf({ not: { channel: 'push' } })).toBe('not');
    expect(kindOf({ ref: 'attributes.plan', eq: 'pro' })).toBe('ref');
    expect(kindOf({ count: 'workout.completed', gte: 1 })).toBe('count');
    expect(kindOf({ never: 'app.reviewed' })).toBe('never');
    expect(kindOf({ lastSeen: { within: '30d' } })).toBe('lastSeen');
    expect(kindOf({ channel: 'push' })).toBe('channel');
  });
});

describe('durations', () => {
  it('rejects anything that is not a duration', () => {
    for (const value of ['30', 'd', '1w', '1.5d', '-1d', '', ' 1d', '1d ', '123456d', '1s']) {
      expect(() => assertExpressionShape({ lastSeen: { within: value as never } }), value).toThrow(
        ExpressionError
      );
    }
    expect(() => assertExpressionShape({ lastSeen: { within: '30d' } })).not.toThrow();
  });
});

describe('assertExpressionShape', () => {
  it('accepts a five-leaf segment', () => {
    expect(() =>
      assertExpressionShape({
        all: [
          { ref: 'attributes.plan', eq: 'pro' },
          { count: 'workout.completed', within: '7d', gte: 3 },
          { never: 'app.reviewed' },
          { lastSeen: { within: '30d' } },
          { channel: 'push' },
        ],
      })
    ).not.toThrow();
  });

  it('rejects empty groups', () => {
    expect(failure({ all: [] }).message).toBe('A group needs at least one condition');
    expect(failure({ all: [{ any: [] }] }).path).toBe('$.all[0]');
  });

  it('caps nesting depth and reports where it stopped', () => {
    let nested: Expression = { channel: 'push' };
    for (let level = 0; level < MAX_EXPRESSION_DEPTH - 1; level += 1) nested = { all: [nested] };
    expect(() => assertExpressionShape(nested)).not.toThrow();

    const tooDeep = { all: [nested] };
    const error = failure(tooDeep);
    expect(error.message).toBe(`Expressions nest at most ${MAX_EXPRESSION_DEPTH} levels`);
    expect(error.path).toBe(`$${'.all[0]'.repeat(MAX_EXPRESSION_DEPTH)}`);
  });

  it('counts not as a level', () => {
    let nested: Expression = { channel: 'push' };
    for (let level = 0; level < MAX_EXPRESSION_DEPTH; level += 1) nested = { not: nested };
    expect(failure(nested).path).toBe(`$${'.not'.repeat(MAX_EXPRESSION_DEPTH)}`);
  });

  it('caps the number of conditions', () => {
    const leaves = Array.from({ length: MAX_EXPRESSION_LEAVES }, () => ({ channel: 'push' as const }));
    expect(() => assertExpressionShape({ all: leaves })).not.toThrow();

    const error = failure({ all: [...leaves, { channel: 'email' }] });
    expect(error.message).toBe(`Expressions hold at most ${MAX_EXPRESSION_LEAVES} conditions`);
    expect(error.path).toBe(`$.all[${MAX_EXPRESSION_LEAVES}]`);
  });

  it('counts leaves across nested groups', () => {
    const half = Array.from({ length: MAX_EXPRESSION_LEAVES / 2 }, () => ({ channel: 'push' as const }));
    expect(() => assertExpressionShape({ all: [{ any: half }, { any: half }] })).not.toThrow();
    expect(failure({ all: [{ any: half }, { any: [...half, { channel: 'sms' }] }] }).path).toBe(
      `$.all[1].any[${MAX_EXPRESSION_LEAVES / 2}]`
    );
  });

  it('requires a comparator on refs and counts', () => {
    expect(failure({ ref: 'attributes.plan' } as never).message).toBe('A ref needs a comparator');
    expect(failure({ count: 'workout.completed' } as never).message).toBe('A count needs a comparator');
    expect(failure({ count: 'workout.completed', within: '7d' } as never).message).toBe(
      'A count needs a comparator'
    );
    expect(failure({ any: [{ channel: 'push' }, { ref: 'externalId' } as never] }).path).toBe('$.any[1]');
  });

  it('validates every duration where it appears', () => {
    expect(() => failure({ count: 'a', within: '1w' as never, gte: 1 })).not.toThrow();
    expect(() => failure({ never: 'a', within: '0' as never })).not.toThrow();
    expect(() => failure({ lastSeen: { within: 'soon' as never } })).not.toThrow();
    expect(() => failure({ lastSeen: { olderThan: '2 days' as never } })).not.toThrow();
  });

  it('requires a window on lastSeen', () => {
    const error = failure({ all: [{ lastSeen: {} }] });
    expect(error.message).toBe('lastSeen needs within or olderThan');
    expect(error.path).toBe('$.all[0]');
  });
});

describe('listReferencedEvents', () => {
  it('collects count and never names once, wherever they sit', () => {
    expect(
      listReferencedEvents({
        all: [
          { count: 'workout.completed', gte: 1 },
          { any: [{ never: 'app.reviewed' }, { not: { count: 'workout.completed', eq: 0 } }] },
          { ref: 'attributes.plan', eq: 'pro' },
          { channel: 'push' },
        ],
      })
    ).toEqual(['workout.completed', 'app.reviewed']);
  });

  it('is empty without event conditions', () => {
    expect(listReferencedEvents({ lastSeen: { within: '1d' } })).toEqual([]);
    expect(listReferencedEvents({ all: [] })).toEqual([]);
  });
});

describe('assertExpressionShape on schema-valid input', () => {
  it('still catches what the schema cannot express', () => {
    expect(failure({ all: [{ count: 'a', within: '7d' } as never] }).message).toBe(
      'A count needs a comparator'
    );
    expect(failure({ any: [{ lastSeen: {} }] }).path).toBe('$.any[0]');
  });

  it('counts leaves inside not', () => {
    const leaves = Array.from({ length: MAX_EXPRESSION_LEAVES }, () => ({
      not: { channel: 'push' as const },
    }));
    expect(() => assertExpressionShape({ all: leaves })).not.toThrow();
    expect(failure({ all: [...leaves, { not: { channel: 'push' } }] }).path).toBe(
      `$.all[${MAX_EXPRESSION_LEAVES}].not`
    );
  });
});
