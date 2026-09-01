import { runBranch } from '@buzzkit/api/engine/steps/branch';
import { runSteps } from '@buzzkit/api/engine/steps/index';
import type { BranchStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const step: BranchStep = {
  name: 'route',
  branch: [
    {
      name: 'vip',
      when: { ref: 'subscriber.attributes.plan', eq: 'pro' },
      steps: [{ name: 'flag', set: { var: 'lane', value: 'vip' } }],
    },
    { name: 'everyone', steps: [{ name: 'flag', set: { var: 'lane', value: 'everyone' } }] },
  ],
};

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [step] };

describe('runBranch', () => {
  it('takes the first case whose condition holds and runs its lane', async () => {
    const { context, actor } = createHarness(spec);
    actor.evaluations = [true];

    await runBranch(context, step, runSteps);

    expect(context.state.steps.route).toMatchObject({ taken: 'vip' });
    expect(context.state.vars.lane).toBe('vip');
    expect(actor.steps[0]).toMatchObject({ step: 'route', summary: 'Took vip' });
  });

  it('falls through to the unconditional case when no condition holds', async () => {
    const { context, actor } = createHarness(spec);
    actor.evaluations = [false];

    await runBranch(context, step, runSteps);

    expect(context.state.steps.route).toMatchObject({ taken: 'everyone' });
    expect(context.state.vars.lane).toBe('everyone');
  });

  it('records the fallback and runs nothing when no case matches', async () => {
    const onlyConditional: BranchStep = {
      name: 'route',
      branch: [{ name: 'vip', when: { ref: 'subscriber.attributes.plan', eq: 'pro' }, steps: [] }],
    };
    const { context, actor } = createHarness({ ...spec, steps: [onlyConditional] });
    actor.evaluations = [false];

    await runBranch(context, onlyConditional, runSteps);

    expect(context.state.steps.route?.taken).not.toBe('vip');
    expect(context.state.vars.lane).toBeUndefined();
  });
});
