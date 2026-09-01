import { lenientDurationSeconds, type Since, type WorkflowExpression } from '@buzzkit/schema/workflows';
import type { Comparators, Duration, RefCondition, Scalar } from 'buzzkit/expressions';

export type RefResolver = (ref: string) => unknown;

export type HistoryWindow = { from: string | null };

export type HistoryResolver = {
  count: (event: string, window: HistoryWindow) => number;
  opened: (step: string) => boolean;
  delivered: (step: string) => boolean;
};

export type EvaluateOptions = {
  history: HistoryResolver;
  now: Date;
  since: Record<Since, string>;
};

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

function windowStart(node: { within?: Duration; since?: Since }, options: EvaluateOptions): HistoryWindow {
  if (node.since !== undefined) return { from: options.since[node.since] };
  if (node.within !== undefined) {
    const seconds = lenientDurationSeconds(node.within);
    return { from: new Date(options.now.getTime() - seconds * 1000).toISOString() };
  }
  return { from: null };
}

export function resolvePath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function evaluateExpression(
  expression: WorkflowExpression,
  resolve: RefResolver,
  options: EvaluateOptions
): boolean {
  const evaluate = (node: WorkflowExpression): boolean => {
    if ('all' in node) return node.all.every(evaluate);
    if ('any' in node) return node.any.some(evaluate);
    if ('not' in node) return !evaluate(node.not);
    if ('ref' in node) {
      const { ref, ...comparators } = node as RefCondition;
      return matchesComparators(resolve(ref), comparators);
    }
    if ('count' in node) {
      const { count, within, since, ...comparators } = node;
      return matchesComparators(
        options.history.count(count, windowStart({ within, since }, options)),
        comparators
      );
    }
    if ('occurred' in node) {
      const { occurred, within, since } = node;
      return options.history.count(occurred, windowStart({ within, since }, options)) > 0;
    }
    if ('never' in node) {
      return options.history.count(node.never, windowStart({ within: node.within }, options)) === 0;
    }
    if ('opened' in node) return options.history.opened(node.opened);

    return options.history.delivered(node.delivered);
  };
  return evaluate(expression);
}
