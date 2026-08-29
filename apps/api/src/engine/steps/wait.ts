import { describeDuration, durationSeconds, type WaitStep } from 'buzzkit/workflows';
import type { RunContext } from '../context';

export async function runWait(context: RunContext, current: WaitStep): Promise<void> {
  const ms = durationSeconds(current.wait) * 1000;
  const until = new Date(Date.now() + ms).toISOString();
  const duration = describeDuration(current.wait);
  await context.record(current.name, 'sleeping', `Waiting ${duration}`, { until });
  await context.step.sleep(`${current.name}:sleep`, context.scaled(ms));
  context.state.steps[current.name] = await context.record(current.name, 'completed', `Waited ${duration}`);
}
