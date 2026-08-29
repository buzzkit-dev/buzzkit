import { Value } from '@sinclair/typebox/value';
import { formatWorkflowPath, lintWorkflow } from './lint';
import { WorkflowSpecSchema } from './schema';
import type { WorkflowSpec } from './types';

export function isWorkflowSpec(value: unknown): value is WorkflowSpec {
  return Value.Check(WorkflowSpecSchema, value) && lintWorkflow(value).length === 0;
}

export function workflowProblem(value: unknown): string | null {
  const [issue] = lintWorkflow(value);
  if (issue) return `${issue.message} (${formatWorkflowPath(issue.path)})`;
  if (!Value.Check(WorkflowSpecSchema, value)) {
    const error = Value.Errors(WorkflowSpecSchema, value).First();
    return error ? `${error.message} at ${error.path || '/'}` : 'Not a valid workflow.';
  }
  return null;
}
