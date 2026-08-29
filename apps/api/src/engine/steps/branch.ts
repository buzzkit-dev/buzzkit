import { type Expression, evaluateExpression, resolvePath } from 'buzzkit/expressions';
import type { BranchStep, Step } from 'buzzkit/workflows';
import type { RunContext } from '../context';

export async function runBranch(
  context: RunContext,
  current: BranchStep,
  runSteps: (context: RunContext, steps: Step[]) => Promise<void>
): Promise<void> {
  const { name, branch } = current;
  const taken = await context.do(`${name}:branch`, async () => {
    const scope = context.scope();
    const yes = evaluateExpression(branch.if as Expression, (ref) => resolvePath(scope, ref));
    await context.report(name, 'completed', yes ? 'Took then' : 'Took else', {
      taken: yes ? 'then' : 'else',
    });
    return { at: new Date().toISOString(), taken: yes ? 'then' : 'else' };
  });
  context.state.steps[name] = taken;
  await runSteps(context, taken.taken === 'then' ? branch.then : (branch.else ?? []));
}
