import { env } from 'cloudflare:workers';
import { ExitRun, RunContext } from './context';
import { describeFailure } from './errors';
import { runSteps } from './steps';
import type { RunParams, TraceEntry } from './types';

export type DryRunResult = {
  outcome: 'completed' | 'failed';
  exited: boolean;
  error: string | null;
  step: string | null;
  path: string[];
  steps: TraceEntry[];
  vars: Record<string, unknown>;
};

export async function dryRun(params: Omit<RunParams, 'mode'>): Promise<DryRunResult> {
  const context = new RunContext(env, null, { ...params, mode: 'test' }, null);
  let outcome: DryRunResult['outcome'] = 'completed';
  let exited = false;
  let error: string | null = null;
  try {
    await runSteps(context, params.spec.steps);
  } catch (caught) {
    if (caught instanceof ExitRun) {
      exited = true;
    } else {
      outcome = 'failed';
      error = describeFailure(caught);
    }
  }
  const path: string[] = [];
  for (const entry of context.trace) {
    if (path[path.length - 1] !== entry.step) path.push(entry.step);
  }
  return {
    outcome,
    exited,
    error,
    step: outcome === 'failed' ? context.current : null,
    path,
    steps: context.trace,
    vars: context.state.vars,
  };
}
