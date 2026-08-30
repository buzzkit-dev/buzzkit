import { describeDuration, durationSeconds, type WaitStep } from '@buzzkit/schema/workflows';
import type { RunContext } from '../context';

export async function runWait(context: RunContext, current: WaitStep): Promise<void> {
  const ms = durationSeconds(current.wait) * 1000;
  const until = new Date(context.now() + ms).toISOString();
  const duration = describeDuration(current.wait);
  await context.record(current.name, 'sleeping', `Waiting ${duration}`, { until });
  await context.sleep(`${current.name}:sleep`, ms);
  context.state.steps[current.name] = await context.record(current.name, 'completed', `Waited ${duration}`);
}
