import { runWaitUntil } from '@buzzkit/api/engine/steps/wait-until';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const spec: WorkflowSpec = {
  trigger: { event: 'signup' },
  defaultTimezone: 'Europe/Berlin',
  steps: [{ name: 'window', waitUntil: { delay: '1d' } }],
};

describe('runWaitUntil', () => {
  it('resolves the moment, records the wait with its zone, and sleeps until it', async () => {
    const { context, actor, workflowStep } = createHarness(spec);

    await runWaitUntil(context, { name: 'window', waitUntil: { delay: '1d' } });

    expect(actor.steps.map((step) => step.status)).toEqual(['sleeping', 'completed']);
    expect(actor.steps[0]!.detail?.until).toBeDefined();
    expect(workflowStep.sleeps).toHaveLength(1);
    expect(workflowStep.sleeps[0]!.ms).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(workflowStep.sleeps[0]!.ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(context.state.steps.window?.at).toBeDefined();
  });

  it('resolves a wall-clock time in the subscriber zone', async () => {
    const { context, actor } = createHarness(spec, {
      attributes: { $timezone: 'America/New_York' },
    });

    await runWaitUntil(context, { name: 'window', waitUntil: { time: '09:00', timezone: 'subscriber' } });

    expect(actor.steps[0]!.detail?.timezone).toBe('America/New_York');
  });
});
