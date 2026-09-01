import { runForEach } from '@buzzkit/api/engine/steps/for-each';
import { runSteps } from '@buzzkit/api/engine/steps/index';
import type { ForEachStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const step: ForEachStep = {
  name: 'each',
  forEach: {
    items: 'trigger.data.items',
    as: 'item',
    max: 2,
    steps: [{ name: 'mark', set: { var: 'seen', value: '{{vars.item}}' } }],
  },
};

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [step] };

describe('runForEach', () => {
  it('iterates each item up to the cap, binding the loop variable', async () => {
    const { context, actor } = createHarness(spec, {
      trigger: {
        name: 'signup',
        data: { items: ['a', 'b', 'c'] },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    await runForEach(context, step, runSteps);

    expect(context.state.steps.each).toMatchObject({ count: 2, total: 3 });
    expect(context.state.vars.item).toBeUndefined();
    expect(context.state.vars.seen).toBe('b');
    expect(actor.steps.at(-1)!.summary).toBe('Ran for 2 of 3 items (capped at 2)');
  });

  it('skips when the path is not a list', async () => {
    const { context, actor } = createHarness(spec, {
      trigger: {
        name: 'signup',
        data: { items: 'nope' },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    await runForEach(context, step, runSteps);

    expect(context.state.steps.each).toMatchObject({ count: 0, total: 0 });
    expect(actor.steps[0]).toMatchObject({ status: 'skipped' });
    expect(actor.steps[0]!.summary).toContain('is not a list');
  });

  it('skips an empty list with its own message', async () => {
    const { context, actor } = createHarness(spec, {
      trigger: {
        name: 'signup',
        data: { items: [] },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    await runForEach(context, step, runSteps);

    expect(actor.steps[0]!.summary).toContain('is empty');
  });

  it('reports a plain count when the list fits the cap', async () => {
    const { context, actor } = createHarness(spec, {
      trigger: {
        name: 'signup',
        data: { items: ['only'] },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    await runForEach(context, step, runSteps);

    expect(actor.steps.at(-1)!.summary).toBe('Ran for 1 item');
  });
});
