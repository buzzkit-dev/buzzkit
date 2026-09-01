import { BadRequestError } from '@buzzkit/api/libs/error';
import { durationSeconds } from '@buzzkit/schema/workflows';
import type { Expression, Scalar } from 'buzzkit/expressions';
import { ATTRIBUTE_KEY_PATTERN } from './constants';
import { assertExpressionShape, ExpressionError, kindOf } from './validate';

type Comparators = {
  eq?: Scalar;
  neq?: Scalar;
  gt?: number | string;
  gte?: number | string;
  lt?: number | string;
  lte?: number | string;
  in?: Scalar[];
  contains?: string;
  exists?: boolean;
};

export type CompiledSegment = { where: string };

export function compileSegment(
  tenantId: number,
  expression: Expression,
  param = 'expression'
): CompiledSegment {
  try {
    assertExpressionShape(expression);
    return { where: compileNode(tenantId, expression, '$') };
  } catch (error) {
    if (error instanceof ExpressionError) {
      throw new BadRequestError(error.message, {
        code: 'invalid_expression',
        param: `${param}${error.path.slice(1)}`,
      });
    }
    throw error;
  }
}

export function memberQuery(
  tenantId: number,
  compiled: CompiledSegment,
  options: { afterSubscriberId?: number; limit: number }
): string {
  return [
    'SELECT s.subscriber_id, s.external_id',
    'FROM subscriber_attributes AS s FINAL',
    `WHERE s.tenant_id = ${literal(tenantId)} AND s.deleted = 0 AND (${compiled.where})`,
    options.afterSubscriberId === undefined
      ? ''
      : `AND s.subscriber_id > ${literal(options.afterSubscriberId)}`,
    'ORDER BY s.subscriber_id ASC',
    `LIMIT ${literal(options.limit)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function countQuery(tenantId: number, compiled: CompiledSegment): string {
  return [
    'SELECT count() AS total',
    'FROM subscriber_attributes AS s FINAL',
    `WHERE s.tenant_id = ${literal(tenantId)} AND s.deleted = 0 AND (${compiled.where})`,
  ].join('\n');
}

export function literal(value: Scalar): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ExpressionError('Numbers must be finite', '$');
    return String(value);
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function compileNode(tenantId: number, node: Expression, path: string): string {
  const kind = kindOf(node);
  switch (kind) {
    case 'all':
      return `(${(node as { all: Expression[] }).all.map((child, index) => compileNode(tenantId, child, `${path}.all[${index}]`)).join(' AND ')})`;
    case 'any':
      return `(${(node as { any: Expression[] }).any.map((child, index) => compileNode(tenantId, child, `${path}.any[${index}]`)).join(' OR ')})`;
    case 'not':
      return `(NOT ${compileNode(tenantId, (node as { not: Expression }).not, `${path}.not`)})`;
    case 'ref':
      return compileRef(node as { ref: string } & Comparators, path);
    case 'count':
      return compileCount(
        tenantId,
        node as { count: string; within?: string } & Record<string, number | string | undefined>,
        path
      );
    case 'never': {
      const { never, within } = node as { never: string; within?: string };
      return `s.subscriber_id NOT IN (${eventSubscribers(tenantId, never, within)})`;
    }
    case 'lastSeen':
      return compileLastSeen(
        tenantId,
        (node as { lastSeen: { within?: string; olderThan?: string } }).lastSeen
      );
    case 'channel':
      return compileChannel(tenantId, (node as { channel: string }).channel);
  }
}

function compileRef(condition: { ref: string } & Comparators, path: string): string {
  const { ref, ...comparators } = condition;
  const column = resolveRef(ref, path);
  const present = (clause: string) => (column.exists === '1' ? clause : `${column.exists} AND ${clause}`);
  const clauses: string[] = [];
  if (comparators.exists !== undefined) {
    clauses.push(comparators.exists ? column.exists : `NOT ${column.exists}`);
  }
  if (comparators.eq !== undefined) {
    clauses.push(
      comparators.eq === null
        ? `NOT ${column.exists}`
        : present(`${column.typed(comparators.eq)} = ${literal(comparators.eq)}`)
    );
  }
  if (comparators.neq !== undefined) {
    clauses.push(
      comparators.neq === null
        ? column.exists
        : `NOT (${present(`${column.typed(comparators.neq)} = ${literal(comparators.neq)}`)})`
    );
  }
  for (const [operator, symbol] of [
    ['gt', '>'],
    ['gte', '>='],
    ['lt', '<'],
    ['lte', '<='],
  ] as const) {
    const value = comparators[operator];
    if (value !== undefined) clauses.push(present(`${column.typed(value)} ${symbol} ${literal(value)}`));
  }
  if (comparators.in !== undefined) {
    const sample = comparators.in.find((value) => value !== null) ?? '';
    clauses.push(present(`${column.typed(sample)} IN (${comparators.in.map(literal).join(', ')})`));
  }
  if (comparators.contains !== undefined) {
    clauses.push(
      present(`positionCaseInsensitive(${column.typed('')}, ${literal(comparators.contains)}) > 0`)
    );
  }

  return `(${clauses.join(' AND ')})`;
}

function resolveRef(ref: string, path: string): { exists: string; typed: (sample: Scalar) => string } {
  if (ref === 'externalId') {
    return { exists: '1', typed: () => 's.external_id' };
  }
  if (!ref.startsWith('attributes.')) {
    throw new ExpressionError(
      `'${ref}' is not something a segment can filter on; use attributes.<key> or externalId`,
      path
    );
  }
  const keys = ref.slice('attributes.'.length).split('.');
  for (const key of keys) {
    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      throw new ExpressionError(`'${ref}' is not a valid attribute path`, path);
    }
  }
  const pathArguments = keys.map((key) => literal(key)).join(', ');

  return {
    exists: `JSONHas(s.attributes_raw, ${pathArguments})`,
    typed: (sample) => {
      if (typeof sample === 'number') return `JSONExtractFloat(s.attributes_raw, ${pathArguments})`;
      if (typeof sample === 'boolean') return `JSONExtractBool(s.attributes_raw, ${pathArguments})`;
      return `JSONExtractString(s.attributes_raw, ${pathArguments})`;
    },
  };
}

function eventSubscribers(
  tenantId: number,
  name: string,
  within: string | undefined,
  having?: string
): string {
  const window =
    within === undefined
      ? ''
      : ` AND timestamp >= now() - INTERVAL ${literal(durationSeconds(within as never))} SECOND`;

  return [
    'SELECT subscriber_id FROM events',
    `WHERE tenant_id = ${literal(tenantId)} AND name = ${literal(name)}${window}`,
    'GROUP BY subscriber_id',
    having ? `HAVING ${having}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function compileCount(
  tenantId: number,
  condition: { count: string; within?: string } & Record<string, number | string | undefined>,
  path: string
): string {
  const clauses: string[] = [];
  const { count: name, within } = condition;
  const membership = (having: string) =>
    `s.subscriber_id IN (${eventSubscribers(tenantId, name, within, having)})`;
  const absence = (having: string) =>
    `s.subscriber_id NOT IN (${eventSubscribers(tenantId, name, within, having)})`;
  const numeric = (key: string): number | undefined => {
    const value = condition[key];
    return typeof value === 'number' ? value : undefined;
  };
  const eq = numeric('eq');
  const gt = numeric('gt');
  const gte = numeric('gte');
  const lt = numeric('lt');
  const lte = numeric('lte');
  if (eq !== undefined)
    clauses.push(eq === 0 ? absence('count() >= 1') : membership(`count() = ${literal(eq)}`));
  if (gt !== undefined) clauses.push(membership(`count() > ${literal(gt)}`));
  if (gte !== undefined) clauses.push(gte === 0 ? '1' : membership(`count() >= ${literal(gte)}`));
  if (lt !== undefined) clauses.push(lt === 0 ? '0' : absence(`count() >= ${literal(lt)}`));
  if (lte !== undefined) clauses.push(absence(`count() > ${literal(lte)}`));
  if (clauses.length === 0) throw new ExpressionError('A count needs a comparator', path);

  return `(${clauses.join(' AND ')})`;
}

function compileLastSeen(tenantId: number, window: { within?: string; olderThan?: string }): string {
  const clauses: string[] = ['max(last_seen) > toDateTime64(0, 3)'];
  if (window.within !== undefined) {
    clauses.push(
      `max(last_seen) >= now() - INTERVAL ${literal(durationSeconds(window.within as never))} SECOND`
    );
  }
  if (window.olderThan !== undefined) {
    clauses.push(
      `max(last_seen) < now() - INTERVAL ${literal(durationSeconds(window.olderThan as never))} SECOND`
    );
  }
  return `s.subscriber_id IN (SELECT subscriber_id FROM subscriber_activity WHERE tenant_id = ${literal(tenantId)} GROUP BY subscriber_id HAVING ${clauses.join(' AND ')})`;
}

function compileChannel(tenantId: number, channel: string): string {
  return [
    's.subscriber_id IN (SELECT subscriber_id FROM subscription_state',
    `WHERE tenant_id = ${literal(tenantId)} AND channel = ${literal(channel)}`,
    'GROUP BY subscriber_id, channel, endpoint',
    'HAVING bitAnd(max(status_code), 3) = 1 AND bitAnd(max(enabled_code), 3) != 2)',
  ].join(' ');
}
