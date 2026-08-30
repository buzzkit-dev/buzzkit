import { formatExpressionPath, lintExpression } from './lint';
import type { Expression } from './types';

export function isExpression(value: unknown): value is Expression {
  return lintExpression(value).length === 0;
}

export function expressionProblem(value: unknown): string | null {
  const [issue] = lintExpression(value);
  return issue ? `${issue.message} (${formatExpressionPath(issue.path)})` : null;
}
