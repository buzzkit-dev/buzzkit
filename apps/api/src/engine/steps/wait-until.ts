import type { WaitUntilStep } from 'buzzkit/workflows';
import { describeInstant } from '../anchors';
import type { RunContext } from '../context';

export async function runWaitUntil(context: RunContext, current: WaitUntilStep): Promise<void> {
  const { name, waitUntil } = current;
  const target = await context.do(`${name}:resolve`, async () => context.anchor(waitUntil));
  const until = new Date(target).toISOString();
  const moment = describeInstant(target, waitUntil.timezone);
  await context.record(name, 'sleeping', `Waiting until ${moment}`, { until });
  const delay = await context.do(`${name}:delay`, async () => context.scaled(target - Date.now()));
  await context.step.sleep(`${name}:sleep`, delay);
  context.state.steps[name] = await context.record(name, 'completed', `Reached ${moment}`);
}
