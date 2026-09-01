import { runWait } from '@buzzkit/api/engine/steps/wait';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [{ name: 'pause', wait: '2h' }] };

describe('runWait', () => {
  it('records sleeping with the target instant, sleeps the duration, then completes', async () => {
    const { context, actor, workflowStep } = createHarness(spec);

    await runWait(context, { name: 'pause', wait: '2h' });

    expect(actor.steps.map((step) => step.status)).toEqual(['sleeping', 'completed']);
    expect(actor.steps[0]!.summary).toBe('Waiting 2 hours');
    expect(actor.steps[0]!.detail?.until).toBeDefined();
    expect(actor.steps[1]!.summary).toBe('Waited 2 hours');
    expect(workflowStep.sleeps).toEqual([{ name: 'pause:sleep', ms: 2 * 60 * 60 * 1000 }]);
    expect(context.state.steps.pause?.at).toBeDefined();
  });
});
