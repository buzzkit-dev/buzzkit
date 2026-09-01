import { ExitRun } from '@buzzkit/api/engine/context';
import { runExit } from '@buzzkit/api/engine/steps/exit';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [{ exit: true }] };

describe('runExit', () => {
  it('records the exit then throws ExitRun to unwind the run', async () => {
    const { context, actor } = createHarness(spec);

    await expect(runExit(context)).rejects.toBeInstanceOf(ExitRun);
    expect(actor.steps).toHaveLength(1);
    expect(actor.steps[0]).toMatchObject({ step: 'exit', status: 'completed', summary: 'Exited' });
  });
});
