import { Value } from '@sinclair/typebox/value';
import { formatExpressionPath, lintExpression } from './lint';
import { ExpressionSchema } from './schema';
import type { Expression } from './types';
import { assertExpressionShape, ExpressionError } from './validate';

export function isExpression(value: unknown): value is Expression {
  if (!Value.Check(ExpressionSchema, value)) return false;
  try {
    assertExpressionShape(value as Expression);
    return true;
  } catch {
    return false;
  }
}

export function expressionProblem(value: unknown): string | null {
  const [issue] = lintExpression(value);
  if (issue) return `${issue.message} (${formatExpressionPath(issue.path)})`;
  if (!Value.Check(ExpressionSchema, value)) {
    const error = Value.Errors(ExpressionSchema, value).First();
    return error ? `${error.message} at ${error.path || '/'}` : 'Not a valid expression.';
  }
  try {
    assertExpressionShape(value as Expression);
    return null;
  } catch (caught) {
    if (caught instanceof ExpressionError) return `${caught.message} at ${caught.path}`;
    throw caught;
  }
}
