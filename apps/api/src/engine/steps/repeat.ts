import {
  type Duration,
  describeDuration,
  durationMs,
  type RepeatStep,
  type Step,
} from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';

type StepRunner = (context: RunContext, steps: Step[]) => Promise<void>;

export async function runRepeat(
  context: RunContext,
  current: RepeatStep,
  runSteps: StepRunner
): Promise<void> {
  const { name, repeat } = current;
  const everyMs = durationMs(repeat.every as Duration);
  let passes = 0;
  let untilMet = false;

  for (let pass = 1; pass <= repeat.max; pass += 1) {
    context.iterationStartedAt = new Date(context.now()).toISOString();
    passes = pass;
    await context.withLoopFrame(`${name}#${pass}`, async () => {
      await runSteps(context, repeat.steps);
    });
    context.current = name;
    if (repeat.until !== undefined) {
      untilMet = await context.do(
        `${name}:until#${pass}`,
        async () => await context.evaluate(repeat.until as NonNullable<typeof repeat.until>)
      );
      if (untilMet) break;
    }
    if (pass < repeat.max) {
      await context.record(
        name,
        'sleeping',
        `Pass ${pass} of ${repeat.max}, next in ${describeDuration(repeat.every)}`
      );
      await context.sleep(`${name}:every#${pass}`, everyMs);
    }
  }

  context.iterationStartedAt = null;
  const summary = untilMet
    ? `Done after ${passes} ${passes === 1 ? 'pass' : 'passes'}`
    : `Stopped at the ${repeat.max}-pass cap`;
  context.state.steps[name] = {
    ...(await context.record(name, 'completed', summary)),
    iterations: passes,
    until: untilMet,
  };
}
