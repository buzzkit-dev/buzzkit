import { runSteps } from '@buzzkit/api/engine/steps/index';
import { runRepeat } from '@buzzkit/api/engine/steps/repeat';
import type { RepeatStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const step: RepeatStep = {
  name: 'nudge',
  repeat: {
    every: '1d',
    max: 3,
    until: { ref: 'subscriber.attributes.done', eq: true },
    steps: [{ name: 'mark', set: { var: 'passes', value: 'ran' } }],
  },
};

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [step] };

describe('runRepeat', () => {
  it('stops when the until condition is met and reports the pass count', async () => {
    const { context, actor, workflowStep } = createHarness(spec);
    actor.evaluations = [false, true];

    await runRepeat(context, step, runSteps);

    expect(context.state.steps.nudge).toMatchObject({ iterations: 2, until: true });
    expect(workflowStep.sleeps).toHaveLength(1);
    expect(workflowStep.sleeps[0]!.ms).toBe(24 * 60 * 60 * 1000);
    expect(actor.steps.at(-1)!.summary).toBe('Done after 2 passes');
    expect(context.iterationStartedAt).toBeNull();
  });

  it('stops at the pass cap when the condition never holds', async () => {
    const { context, actor, workflowStep } = createHarness(spec);
    actor.evaluations = [false, false, false];

    await runRepeat(context, step, runSteps);

    expect(context.state.steps.nudge).toMatchObject({ iterations: 3, until: false });
    expect(workflowStep.sleeps).toHaveLength(2);
    expect(actor.steps.at(-1)!.summary).toBe('Stopped at the 3-pass cap');
  });

  it('scopes inner step names per pass through loop frames', async () => {
    const { context, workflowStep, actor } = createHarness(spec);
    actor.evaluations = [true];

    await runRepeat(context, step, runSteps);

    expect(workflowStep.invoked.some((name) => name.endsWith('@nudge#1'))).toBe(true);
  });

  it('runs every pass without an until condition', async () => {
    const unconditional: RepeatStep = {
      name: 'nudge',
      repeat: { every: '1h', max: 2, steps: [] },
    };
    const { context, workflowStep } = createHarness({ ...spec, steps: [unconditional] });

    await runRepeat(context, unconditional, runSteps);

    expect(context.state.steps.nudge).toMatchObject({ iterations: 2, until: false });
    expect(workflowStep.sleeps).toHaveLength(1);
  });
});
