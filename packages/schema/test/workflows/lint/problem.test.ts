import { describe, expect, it } from 'vitest';
import { isWorkflowSpec, workflowProblem } from '../../../src/workflows/index';

describe('parse', () => {
  it('answers yes/no and names the first problem', () => {
    const good = { trigger: { event: 'a' }, steps: [{ name: 'x', wait: '1h' }] };
    expect(isWorkflowSpec(good)).toBe(true);
    expect(workflowProblem(good)).toBeNull();
    expect(isWorkflowSpec({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: '1 hour' }] })).toBe(false);
    expect(workflowProblem({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: '1 hour' }] })).toBe(
      '"1 hour" is not a duration. Use a number followed by m, h or d, such as "15m", "2h" or "3d". (steps[0].wait)'
    );
    expect(workflowProblem('nope')).toBe(
      'A workflow is an object with "trigger" and "steps", got "nope". (the workflow)'
    );
    expect(isWorkflowSpec({ trigger: { event: 'a' }, steps: [{ name: 'x', wait: '1h', extra: 1 }] })).toBe(
      false
    );
  });
});
