import type { WaitUntilStep } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';
import { describeInstant } from '../moments';

export async function runWaitUntil(context: RunContext, current: WaitUntilStep): Promise<void> {
  const { name, waitUntil } = current;
  const target = await context.do(`${name}:resolve`, async () => context.moment(waitUntil));
  const until = new Date(target.at).toISOString();
  const moment = describeInstant(target.at, target.timezone);
  await context.record(name, 'sleeping', `Waiting until ${moment}`, { until, timezone: target.timezone });
  await context.sleep(`${name}:sleep`, target.at - context.now());
  context.state.steps[name] = await context.record(name, 'completed', `Reached ${moment}`);
}
