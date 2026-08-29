import type { Comparators, Expression, RefCondition, Scalar } from './types';

export type RefResolver = (ref: string) => unknown;

export class UnsupportedConditionError extends Error {
  constructor(readonly kind: string) {
    super(`"${kind}" conditions cannot be evaluated here`);
    this.name = 'UnsupportedConditionError';
  }
}

function isScalar(value: unknown): value is Scalar {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function compareOrdered(
  value: unknown,
  expected: number | string,
  test: (order: number) => boolean
): boolean {
  if (typeof value === 'number' && typeof expected === 'number') return test(value - expected);
  if (typeof value === 'string' && typeof expected === 'string') return test(value.localeCompare(expected));
  if (typeof value === 'string' && typeof expected === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? false : test(parsed - expected);
  }
  return false;
}

function matchesComparators(value: unknown, comparators: Comparators): boolean {
  const present = value !== undefined && value !== null;
  if (comparators.exists !== undefined && present !== comparators.exists) return false;
  if (comparators.eq !== undefined && (!present || value !== comparators.eq)) return false;
  if (comparators.neq !== undefined && present && value === comparators.neq) return false;
  if (comparators.in !== undefined && (!isScalar(value) || !comparators.in.includes(value))) return false;
  if (comparators.contains !== undefined) {
    if (typeof value !== 'string') return false;
    if (!value.toLowerCase().includes(comparators.contains.toLowerCase())) return false;
  }
  if (comparators.gt !== undefined && !compareOrdered(value, comparators.gt, (order) => order > 0))
    return false;
  if (comparators.gte !== undefined && !compareOrdered(value, comparators.gte, (order) => order >= 0))
    return false;
  if (comparators.lt !== undefined && !compareOrdered(value, comparators.lt, (order) => order < 0))
    return false;
  if (comparators.lte !== undefined && !compareOrdered(value, comparators.lte, (order) => order <= 0))
    return false;
  return true;
}

export function resolvePath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function evaluateExpression(expression: Expression, resolve: RefResolver): boolean {
  if ('all' in expression) return expression.all.every((child) => evaluateExpression(child, resolve));
  if ('any' in expression) return expression.any.some((child) => evaluateExpression(child, resolve));
  if ('not' in expression) return !evaluateExpression(expression.not, resolve);
  if ('ref' in expression) {
    const { ref, ...comparators } = expression as RefCondition;
    return matchesComparators(resolve(ref), comparators);
  }
  const kind = Object.keys(expression)[0] ?? 'unknown';
  throw new UnsupportedConditionError(kind);
}
