import { runSteps } from '@buzzkit/api/engine/steps/index';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn(() => ({})) }));
vi.mock('@buzzkit/api/api/tenants/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTenantById: vi.fn(async () => ({ id: 1, slug: 'default', settings: {} })),
}));
vi.mock('@buzzkit/api/api/messages/index', () => ({
  createMessage: vi.fn(async () => ({ message: { id: 5 } })),
  enqueueFanout: vi.fn(),
}));

import { createMessage } from '@buzzkit/api/api/messages/index';
import { ExitRun } from '@buzzkit/api/engine/context';

beforeEach(() => {
  vi.mocked(createMessage).mockClear();
});

describe('runSteps', () => {
  it('pairs a waitUntil with a following local send into one local window', async () => {
    const spec: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [
        { name: 'window', waitUntil: { time: '19:00', timezone: 'UTC' } },
        { name: 'remind', send: { title: 'Hi', deliver: 'local' } },
        { name: 'after', set: { var: 'done', value: true } },
      ],
    };
    const { context, actor } = createHarness(spec);
    actor.localScheduled.add(`${context.params.runId}:remind`);

    await runSteps(context, spec.steps);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(context.state.vars.done).toBe(true);
    expect(actor.steps.filter((entry) => entry.step === 'window')).toHaveLength(2);
  });

  it('leaves a waitUntil before a push send unpaired', async () => {
    const spec: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [
        { name: 'window', waitUntil: { delay: '1h' } },
        { name: 'push', send: { title: 'Hi' } },
      ],
    };
    const { context, workflowStep } = createHarness(spec);

    await runSteps(context, spec.steps);

    expect(workflowStep.invoked).toContain('window:resolve');
    expect(workflowStep.invoked).toContain('push:send');
  });

  it('stops the walk when an exit step throws ExitRun', async () => {
    const spec: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [{ exit: true }, { name: 'never', set: { var: 'x', value: 1 } }],
    };
    const { context } = createHarness(spec);

    await expect(runSteps(context, spec.steps)).rejects.toBeInstanceOf(ExitRun);
    expect(context.state.vars.x).toBeUndefined();
  });
});
