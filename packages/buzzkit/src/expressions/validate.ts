import {
  DURATION_PATTERN,
  DURATION_UNIT_SECONDS,
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_LEAVES,
} from './constants';
import type { Duration, Expression, ExpressionKind } from './types';

export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly path: string
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export function kindOf(expression: Expression): ExpressionKind {
  if ('all' in expression) return 'all';
  if ('any' in expression) return 'any';
  if ('not' in expression) return 'not';
  if ('ref' in expression) return 'ref';
  if ('count' in expression) return 'count';
  if ('never' in expression) return 'never';
  if ('lastSeen' in expression) return 'lastSeen';
  return 'channel';
}

export function durationSeconds(duration: Duration): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) throw new ExpressionError(`'${duration}' is not a duration like 30d, 12h or 15m`, 'within');
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2] as keyof typeof DURATION_UNIT_SECONDS];
}

export function assertExpressionShape(expression: Expression): void {
  let leaves = 0;
  const walk = (node: Expression, depth: number, path: string) => {
    if (depth > MAX_EXPRESSION_DEPTH) {
      throw new ExpressionError(`Expressions nest at most ${MAX_EXPRESSION_DEPTH} levels`, path);
    }
    const kind = kindOf(node);
    if (kind === 'all' || kind === 'any') {
      const children = (node as { all?: Expression[]; any?: Expression[] })[kind] ?? [];
      if (children.length === 0) throw new ExpressionError('A group needs at least one condition', path);
      for (const [index, child] of children.entries()) walk(child, depth + 1, `${path}.${kind}[${index}]`);
      return;
    }
    if (kind === 'not') {
      walk((node as { not: Expression }).not, depth + 1, `${path}.not`);
      return;
    }
    leaves += 1;
    if (leaves > MAX_EXPRESSION_LEAVES) {
      throw new ExpressionError(`Expressions hold at most ${MAX_EXPRESSION_LEAVES} conditions`, path);
    }
    if (kind === 'ref') {
      const comparators = Object.keys(node).filter((key) => key !== 'ref');
      if (comparators.length === 0) throw new ExpressionError('A ref needs a comparator', path);
    }
    if (kind === 'count') {
      const comparators = Object.keys(node).filter((key) => key !== 'count' && key !== 'within');
      if (comparators.length === 0) throw new ExpressionError('A count needs a comparator', path);
      if ('within' in node && node.within !== undefined) durationSeconds(node.within);
    }
    if (kind === 'never' && 'within' in node && node.within !== undefined) durationSeconds(node.within);
    if (kind === 'lastSeen') {
      const window = (node as { lastSeen: { within?: Duration; olderThan?: Duration } }).lastSeen;
      if (window.within === undefined && window.olderThan === undefined) {
        throw new ExpressionError('lastSeen needs within or olderThan', path);
      }
      if (window.within !== undefined) durationSeconds(window.within);
      if (window.olderThan !== undefined) durationSeconds(window.olderThan);
    }
  };
  walk(expression, 1, '$');
}

export function listReferencedEvents(expression: Expression): string[] {
  const names = new Set<string>();
  const walk = (node: Expression) => {
    const kind = kindOf(node);
    if (kind === 'all' || kind === 'any') {
      for (const child of (node as { all?: Expression[]; any?: Expression[] })[kind] ?? []) walk(child);
    } else if (kind === 'not') walk((node as { not: Expression }).not);
    else if (kind === 'count') names.add((node as { count: string }).count);
    else if (kind === 'never') names.add((node as { never: string }).never);
  };
  walk(expression);
  return [...names];
}
