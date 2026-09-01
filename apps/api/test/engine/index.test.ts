import { EngineWorkflow } from '@buzzkit/api/engine/index';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateActor, activeActor, FakeWorkflowStep, runParams } from '../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn(() => ({})) }));
vi.mock('@buzzkit/api/api/tenants/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTenantById: vi.fn(async () => ({ id: 1, settings: {} })),
}));
vi.mock('@buzzkit/api/api/topics/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTopicBySlug: vi.fn(),
}));

import { log } from '@buzzkit/api/libs/logger';

function harnessedWorkflow() {
  const flushes: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => flushes.push(promise) };
  const env = { WORKFLOW_TIME_SCALE: '1', SUBSCRIBER_ACTOR: {} };

  return new EngineWorkflow(ctx as never, env as never);
}

beforeEach(() => {
  activateActor();
  vi.mocked(log.error).mockReset();
  vi.mocked(log.info).mockReset();
});

describe('EngineWorkflow', () => {
  it('runs every step then records the run as completed', async () => {
    const spec: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [{ name: 'remember', set: { var: 'x', value: 1 } }],
    };
    const workflow = harnessedWorkflow();
    const step = new FakeWorkflowStep();

    await workflow.run({ payload: runParams(spec) } as never, step as never);

    const actor = activeActor();
    expect(actor.finished).toMatchObject({ status: 'completed' });
    expect(log.info).toHaveBeenCalledWith(
      '[Engine] Run completed',
      expect.objectContaining({ tenantId: 1, subscriberId: 1 })
    );
    expect(step.invoked).toContain('finish');
  });

  it('treats an exit as completion', async () => {
    const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [{ exit: true }] };
    const workflow = harnessedWorkflow();

    await workflow.run({ payload: runParams(spec) } as never, new FakeWorkflowStep() as never);

    expect(activeActor().finished).toMatchObject({ status: 'completed' });
  });

  it('records the failing step, marks the run failed, and rethrows', async () => {
    const spec: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [{ name: 'welcome', send: { title: 'Hi' } }],
    };
    const { findTenantById } = await import('@buzzkit/api/api/tenants/index');
    const { NotFoundError } = await import('@buzzkit/api/libs/error');
    vi.mocked(findTenantById).mockRejectedValue(new NotFoundError('Tenant not found'));
    const workflow = harnessedWorkflow();

    await expect(
      workflow.run({ payload: runParams(spec) } as never, new FakeWorkflowStep() as never)
    ).rejects.toThrow('Tenant not found');

    const actor = activeActor();
    expect(actor.finished).toMatchObject({ status: 'failed', error: 'Tenant not found', step: 'welcome' });
    expect(actor.steps.at(-1)).toMatchObject({ step: 'welcome', status: 'failed' });
    expect(log.error).toHaveBeenCalledWith(
      '[Engine] Run failed',
      expect.objectContaining({ step: 'welcome', error: 'Tenant not found' })
    );

    vi.mocked(findTenantById).mockResolvedValue({ id: 1, settings: {} } as never);
  });
});
