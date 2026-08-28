import {
  compileSegment,
  countQuery,
  literal,
  memberQuery,
  SEGMENT_MEMBERS_PAGE,
} from '@buzzkit/api/api/segments/index';
import { BadRequestError } from '@buzzkit/api/libs/error';
import type { Expression } from 'buzzkit/expressions';
import { describe, expect, it } from 'vitest';

const tenantId = 42;

const where = (expression: Expression) => compileSegment(tenantId, expression).where;

function invalid(expression: Expression): InstanceType<typeof BadRequestError> {
  let thrown: unknown;
  try {
    compileSegment(tenantId, expression);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(BadRequestError);
  const error = thrown as InstanceType<typeof BadRequestError>;
  expect(error.code).toBe('invalid_expression');
  expect(error.status).toBe(400);
  return error;
}

describe('literal', () => {
  it('renders every scalar as a ClickHouse literal', () => {
    expect(literal(null)).toBe('NULL');
    expect(literal(true)).toBe('1');
    expect(literal(false)).toBe('0');
    expect(literal(7)).toBe('7');
    expect(literal(-1.5)).toBe('-1.5');
    expect(literal('pro')).toBe("'pro'");
  });

  it('escapes quotes and backslashes so values cannot break out', () => {
    expect(literal("O'Brien")).toBe("'O\\'Brien'");
    expect(literal("' OR 1=1 --")).toBe("'\\' OR 1=1 --'");
    expect(literal('C:\\temp')).toBe("'C:\\\\temp'");
    expect(literal("\\'")).toBe("'\\\\\\''");
  });

  it('refuses numbers that are not finite', () => {
    expect(() => literal(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => literal(Number.NaN)).toThrow();
  });
});

describe('compileSegment refs', () => {
  const has = (key: string) => `JSONHas(s.attributes_raw, '${key}')`;

  it('reads attributes as the type of the compared value, only where the key exists', () => {
    expect(where({ ref: 'attributes.plan', eq: 'pro' })).toBe(
      `(${has('plan')} AND JSONExtractString(s.attributes_raw, 'plan') = 'pro')`
    );
    expect(where({ ref: 'attributes.age', gt: 18 })).toBe(
      `(${has('age')} AND JSONExtractFloat(s.attributes_raw, 'age') > 18)`
    );
    expect(where({ ref: 'attributes.beta', eq: true })).toBe(
      `(${has('beta')} AND JSONExtractBool(s.attributes_raw, 'beta') = 1)`
    );
    expect(where({ ref: 'attributes.beta', eq: false })).toBe(
      `(${has('beta')} AND JSONExtractBool(s.attributes_raw, 'beta') = 0)`
    );
  });

  it('makes neq the exact complement of eq, so missing keys count as not equal', () => {
    expect(where({ ref: 'attributes.beta', neq: false })).toBe(
      `(NOT (${has('beta')} AND JSONExtractBool(s.attributes_raw, 'beta') = 0))`
    );
    expect(where({ ref: 'externalId', neq: 'user_1' })).toBe("(NOT (s.external_id = 'user_1'))");
  });

  it('walks nested attribute paths', () => {
    expect(where({ ref: 'attributes.address.city', eq: 'Berlin' })).toBe(
      "(JSONHas(s.attributes_raw, 'address', 'city') AND JSONExtractString(s.attributes_raw, 'address', 'city') = 'Berlin')"
    );
    expect(where({ ref: 'attributes.$country', eq: 'DE' })).toBe(
      `(${has('$country')} AND JSONExtractString(s.attributes_raw, '$country') = 'DE')`
    );
  });

  it('compares externalId against the column without a presence check', () => {
    expect(where({ ref: 'externalId', eq: 'user_1' })).toBe("(s.external_id = 'user_1')");
    expect(where({ ref: 'externalId', in: ['a', 'b'] })).toBe("(s.external_id IN ('a', 'b'))");
    expect(where({ ref: 'externalId', exists: true })).toBe('(1)');
    expect(where({ ref: 'externalId', contains: 'USER' })).toBe(
      "(positionCaseInsensitive(s.external_id, 'USER') > 0)"
    );
  });

  it('maps every comparator', () => {
    const column = "JSONExtractFloat(s.attributes_raw, 'age')";
    expect(where({ ref: 'attributes.age', gte: 18, lte: 65 })).toBe(
      `(${has('age')} AND ${column} >= 18 AND ${has('age')} AND ${column} <= 65)`
    );
    expect(where({ ref: 'attributes.age', lt: 18 })).toBe(`(${has('age')} AND ${column} < 18)`);
    expect(where({ ref: 'attributes.plan', in: ['pro', 'team'] })).toBe(
      `(${has('plan')} AND JSONExtractString(s.attributes_raw, 'plan') IN ('pro', 'team'))`
    );
    expect(where({ ref: 'attributes.plan', in: [1, 2] })).toBe(
      `(${has('plan')} AND JSONExtractFloat(s.attributes_raw, 'plan') IN (1, 2))`
    );
    expect(where({ ref: 'attributes.city', contains: 'berl' })).toBe(
      `(${has('city')} AND positionCaseInsensitive(JSONExtractString(s.attributes_raw, 'city'), 'berl') > 0)`
    );
  });

  it('treats null and exists as presence checks', () => {
    expect(where({ ref: 'attributes.plan', exists: true })).toBe(`(${has('plan')})`);
    expect(where({ ref: 'attributes.plan', exists: false })).toBe(`(NOT ${has('plan')})`);
    expect(where({ ref: 'attributes.plan', eq: null })).toBe(`(NOT ${has('plan')})`);
    expect(where({ ref: 'attributes.plan', neq: null })).toBe(`(${has('plan')})`);
  });

  it('escapes attribute values and keys', () => {
    expect(where({ ref: 'attributes.plan', eq: "pro' OR 1=1 --" })).toBe(
      `(${has('plan')} AND JSONExtractString(s.attributes_raw, 'plan') = 'pro\\' OR 1=1 --')`
    );
    expect(where({ ref: 'attributes.plan', in: ["a'", 'b\\'] })).toBe(
      `(${has('plan')} AND JSONExtractString(s.attributes_raw, 'plan') IN ('a\\'', 'b\\\\'))`
    );
  });

  it('rejects refs outside attributes and externalId, naming the path', () => {
    const error = invalid({ all: [{ channel: 'push' }, { ref: 'email', eq: 'a@b.c' }] });
    expect(error.param).toBe('expression.all[1]');
    expect(error.message).toContain("'email' is not something a segment can filter on");
    expect(invalid({ ref: 'attributes', eq: 1 }).param).toBe('expression');
    expect(invalid({ ref: 'attributes.', eq: 1 }).param).toBe('expression');
    expect(invalid({ ref: "attributes.plan') OR (1", eq: 1 }).message).toContain(
      'not a valid attribute path'
    );
    expect(invalid({ ref: 'attributes.a..b', eq: 1 }).message).toContain('not a valid attribute path');
    expect(invalid({ ref: 'attributes.plan' } as never).message).toBe('A ref needs a comparator');
  });
});

describe('compileSegment events', () => {
  const events = (name: string, extra = '') =>
    `SELECT subscriber_id FROM events WHERE tenant_id = 42 AND name = '${name}'${extra} GROUP BY subscriber_id`;

  it('counts events per subscriber with a window', () => {
    expect(where({ count: 'workout.completed', gte: 3 })).toBe(
      `(s.subscriber_id IN (${events('workout.completed')} HAVING count() >= 3))`
    );
    expect(where({ count: 'workout.completed', within: '7d', gte: 3 })).toBe(
      `(s.subscriber_id IN (${events('workout.completed', ' AND timestamp >= now() - INTERVAL 604800 SECOND')} HAVING count() >= 3))`
    );
    expect(where({ count: 'a', eq: 2 })).toBe(`(s.subscriber_id IN (${events('a')} HAVING count() = 2))`);
    expect(where({ count: 'a', gt: 2 })).toBe(`(s.subscriber_id IN (${events('a')} HAVING count() > 2))`);
    expect(where({ count: 'a', lt: 2 })).toBe(
      `(s.subscriber_id NOT IN (${events('a')} HAVING count() >= 2))`
    );
    expect(where({ count: 'a', lte: 2 })).toBe(
      `(s.subscriber_id NOT IN (${events('a')} HAVING count() > 2))`
    );
  });

  it('keeps subscribers without events when zero satisfies the comparison', () => {
    expect(where({ count: 'a', eq: 0 })).toBe(
      `(s.subscriber_id NOT IN (${events('a')} HAVING count() >= 1))`
    );
    expect(where({ count: 'a', gte: 0 })).toBe('(1)');
    expect(where({ count: 'a', lt: 0 })).toBe('(0)');
    expect(where({ count: 'a', lte: 0 })).toBe(
      `(s.subscriber_id NOT IN (${events('a')} HAVING count() > 0))`
    );
  });

  it('compiles never as absence, with an optional window', () => {
    expect(where({ never: 'app.reviewed' })).toBe(`s.subscriber_id NOT IN (${events('app.reviewed')})`);
    expect(where({ never: 'app.reviewed', within: '12h' })).toBe(
      `s.subscriber_id NOT IN (${events('app.reviewed', ' AND timestamp >= now() - INTERVAL 43200 SECOND')})`
    );
  });

  it('escapes event names', () => {
    expect(where({ count: "a' OR 1=1", gte: 1 })).toContain("name = 'a\\' OR 1=1'");
  });
});

describe('compileSegment activity and channels', () => {
  it('reads last seen from subscriber_activity and ignores subscribers never seen on a device', () => {
    expect(where({ lastSeen: { within: '30d' } })).toBe(
      'S.subscriber_id IN (SELECT subscriber_id FROM subscriber_activity WHERE tenant_id = 42 GROUP BY subscriber_id HAVING max(last_seen) > toDateTime64(0, 3) AND max(last_seen) >= now() - INTERVAL 2592000 SECOND)'.replace(
        /^S/,
        's'
      )
    );
    expect(where({ lastSeen: { olderThan: '90d' } })).toContain(
      'HAVING max(last_seen) > toDateTime64(0, 3) AND max(last_seen) < now() - INTERVAL 7776000 SECOND)'
    );
    expect(where({ lastSeen: { within: '30d', olderThan: '1d' } })).toContain(
      'max(last_seen) >= now() - INTERVAL 2592000 SECOND AND max(last_seen) < now() - INTERVAL 86400 SECOND'
    );
  });

  it('requires a live, unmuted subscription on the channel', () => {
    expect(where({ channel: 'push' })).toBe(
      "s.subscriber_id IN (SELECT subscriber_id FROM subscription_state WHERE tenant_id = 42 AND channel = 'push' GROUP BY subscriber_id, channel, endpoint HAVING bitAnd(max(status_code), 3) = 1 AND bitAnd(max(enabled_code), 3) != 2)"
    );
  });
});

describe('compileSegment groups', () => {
  it('joins all with AND, any with OR, and wraps not', () => {
    expect(where({ all: [{ channel: 'push' }, { channel: 'email' }] })).toBe(
      `(${where({ channel: 'push' })} AND ${where({ channel: 'email' })})`
    );
    expect(where({ any: [{ channel: 'push' }, { channel: 'email' }] })).toBe(
      `(${where({ channel: 'push' })} OR ${where({ channel: 'email' })})`
    );
    expect(where({ not: { channel: 'push' } })).toBe(`(NOT ${where({ channel: 'push' })})`);
    expect(where({ all: [{ any: [{ channel: 'push' }, { not: { channel: 'sms' } }] }] })).toBe(
      `((${where({ channel: 'push' })} OR (NOT ${where({ channel: 'sms' })})))`
    );
  });

  it('rejects empty groups and over-sized expressions with the path', () => {
    expect(invalid({ all: [] }).param).toBe('expression');
    expect(invalid({ all: [{ any: [] }] }).param).toBe('expression.all[0]');
    let nested: Expression = { channel: 'push' };
    for (let level = 0; level < 8; level += 1) nested = { all: [nested] };
    expect(invalid(nested).message).toBe('Expressions nest at most 8 levels');
    expect(invalid({ all: Array.from({ length: 51 }, () => ({ channel: 'push' as const })) }).message).toBe(
      'Expressions hold at most 50 conditions'
    );
  });
});

describe('memberQuery and countQuery', () => {
  const compiled = compileSegment(tenantId, { channel: 'push' });

  it('scopes to the tenant, reads the latest snapshot and pages by subscriber id', () => {
    expect(memberQuery(tenantId, compiled, { limit: 20 })).toBe(
      [
        'SELECT s.subscriber_id, s.external_id',
        'FROM subscriber_attributes AS s FINAL',
        `WHERE s.tenant_id = 42 AND s.deleted = 0 AND (${compiled.where})`,
        'ORDER BY s.subscriber_id ASC',
        'LIMIT 20',
      ].join('\n')
    );
    expect(
      memberQuery(tenantId, compiled, { afterSubscriberId: 900, limit: SEGMENT_MEMBERS_PAGE })
    ).toContain(`AND s.subscriber_id > 900\nORDER BY s.subscriber_id ASC\nLIMIT ${SEGMENT_MEMBERS_PAGE}`);
  });

  it('counts with the same predicate', () => {
    expect(countQuery(tenantId, compiled)).toBe(
      [
        'SELECT count() AS total',
        'FROM subscriber_attributes AS s FINAL',
        `WHERE s.tenant_id = 42 AND s.deleted = 0 AND (${compiled.where})`,
      ].join('\n')
    );
  });
});

describe('compileSegment edge cases', () => {
  it('reads every channel the grammar allows, including sms', () => {
    expect(where({ channel: 'sms' })).toContain("channel = 'sms'");
    expect(where({ channel: 'email' })).toContain("channel = 'email'");
  });

  it('compares strings with ordering comparators as text', () => {
    expect(where({ ref: 'attributes.tier', gt: 'b' })).toBe(
      "(JSONHas(s.attributes_raw, 'tier') AND JSONExtractString(s.attributes_raw, 'tier') > 'b')"
    );
  });

  it('types an in list by its first non-null value and keeps nulls as literals', () => {
    expect(where({ ref: 'attributes.plan', in: [null, 'pro'] })).toBe(
      "(JSONHas(s.attributes_raw, 'plan') AND JSONExtractString(s.attributes_raw, 'plan') IN (NULL, 'pro'))"
    );
    expect(where({ ref: 'attributes.beta', in: [true, false] })).toBe(
      "(JSONHas(s.attributes_raw, 'beta') AND JSONExtractBool(s.attributes_raw, 'beta') IN (1, 0))"
    );
  });

  it('combines several comparators on one ref with AND', () => {
    expect(where({ ref: 'attributes.plan', neq: 'free', exists: true })).toBe(
      "(JSONHas(s.attributes_raw, 'plan') AND NOT (JSONHas(s.attributes_raw, 'plan') AND JSONExtractString(s.attributes_raw, 'plan') = 'free'))"
    );
  });

  it('accepts system attribute keys and dollar-prefixed event names', () => {
    expect(where({ ref: 'attributes.$timezone', eq: 'Europe/Berlin' })).toContain("'$timezone'");
    expect(where({ count: '$app.opened', within: '12h', gte: 1 })).toContain(
      "name = '$app.opened' AND timestamp >= now() - INTERVAL 43200 SECOND"
    );
    expect(where({ never: '$notification.opened', within: '15m' })).toContain('INTERVAL 900 SECOND');
  });

  it('combines count comparators with AND', () => {
    const compiled = where({ count: 'a', gt: 2, lt: 5 });
    expect(compiled).toContain('HAVING count() > 2');
    expect(compiled).toContain('HAVING count() >= 5');
    expect(
      compiled.startsWith('(s.subscriber_id IN (') && compiled.includes(') AND s.subscriber_id NOT IN (')
    ).toBe(true);
  });

  it('escapes the contains needle and the externalId values', () => {
    expect(where({ ref: 'attributes.city', contains: "l' OR 1=1 --" })).toContain("'l\\' OR 1=1 --'");
    expect(where({ ref: 'externalId', eq: "u' OR '1'='1" })).toBe("(s.external_id = 'u\\' OR \\'1\\'=\\'1')");
  });

  it('keeps a reference to the tenant in every subquery', () => {
    const compiled = where({
      all: [{ count: 'a', gte: 1 }, { never: 'b' }, { lastSeen: { within: '1d' } }, { channel: 'push' }],
    });
    expect(compiled.match(/tenant_id = 42/g)).toHaveLength(4);
  });

  it('refuses attribute keys longer than the limit or with illegal characters', () => {
    expect(invalid({ ref: `attributes.${'k'.repeat(101)}`, eq: 1 }).message).toContain(
      'not a valid attribute path'
    );
    expect(invalid({ ref: 'attributes.plan name', eq: 1 }).message).toContain('not a valid attribute path');
    expect(invalid({ ref: 'attributes.plan;', eq: 1 }).message).toContain('not a valid attribute path');
  });

  it('refuses non-finite numbers', () => {
    expect(() => compileSegment(tenantId, { ref: 'attributes.age', gt: Number.NaN })).toThrow();
    expect(() => compileSegment(tenantId, { count: 'a', gte: Number.POSITIVE_INFINITY })).toThrow();
  });
});
