import { resolvePath } from '@buzzkit/api/actor/evaluate';
import type { ForEachStep, Step } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';

type StepRunner = (context: RunContext, steps: Step[]) => Promise<void>;

export async function runForEach(
  context: RunContext,
  current: ForEachStep,
  runSteps: StepRunner
): Promise<void> {
  const { name, forEach } = current;
  const value = resolvePath(context.scope(), forEach.items);
  const items = Array.isArray(value) ? (value as unknown[]) : null;

  if (items === null || items.length === 0) {
    const summary =
      items === null ? `Skipped: ${forEach.items} is not a list` : `Skipped: ${forEach.items} is empty`;
    context.state.steps[name] = {
      ...(await context.record(name, 'skipped', summary)),
      count: 0,
      total: 0,
    };
    return;
  }

  const total = items.length;
  const taken = items.slice(0, forEach.max);
  for (const [index, item] of taken.entries()) {
    context.state.vars[forEach.as] = item;
    context.state.steps[name] = {
      at: new Date(context.now()).toISOString(),
      index,
      count: taken.length,
      total,
    };
    await context.withLoopFrame(`${name}#${index}`, async () => {
      await runSteps(context, forEach.steps);
    });
    context.current = name;
  }
  delete context.state.vars[forEach.as];

  const summary =
    total > taken.length
      ? `Ran for ${taken.length} of ${total} items (capped at ${forEach.max})`
      : `Ran for ${taken.length} ${taken.length === 1 ? 'item' : 'items'}`;
  context.state.steps[name] = {
    ...(await context.record(name, 'completed', summary)),
    count: taken.length,
    total,
  };
}
