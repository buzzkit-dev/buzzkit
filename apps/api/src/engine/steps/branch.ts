import {
  type BranchStep,
  FALLBACK_CASE,
  type Step,
  type WorkflowExpression,
} from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';

export async function runBranch(
  context: RunContext,
  current: BranchStep,
  runSteps: (context: RunContext, steps: Step[]) => Promise<void>
): Promise<void> {
  const { name, branch } = current;
  const taken = await context.do(`${name}:branch`, async () => {
    let chosen = FALLBACK_CASE;
    for (const entry of branch) {
      if (entry.when === undefined || (await context.evaluate(entry.when as WorkflowExpression))) {
        chosen = entry.name;
        break;
      }
    }
    await context.report(name, 'completed', `Took ${chosen}`, { taken: chosen });
    return { at: new Date(context.now()).toISOString(), taken: chosen };
  });
  context.state.steps[name] = taken;
  await runSteps(context, branch.find((entry) => entry.name === taken.taken)?.steps ?? []);
}
