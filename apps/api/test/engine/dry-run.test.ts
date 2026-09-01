import { dryRun } from '@buzzkit/api/engine/dry-run';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runParams } from '../utils/engineHarness';

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

import { findTopicBySlug } from '@buzzkit/api/api/topics/index';
import { NotFoundError } from '@buzzkit/api/libs/error';

const spec: WorkflowSpec = {
  trigger: { event: 'signup' },
  steps: [
    { name: 'remember', set: { var: 'plan', value: '{{trigger.data.plan}}' } },
    { name: 'pause', wait: '1h' },
    { name: 'welcome', send: { title: 'Hi', topic: 'promos' } },
  ],
};

beforeEach(() => {
  vi.mocked(findTopicBySlug).mockReset();
});

function params(overrides = {}) {
  const { mode: _mode, ...rest } = runParams(spec, {
    subscriberId: 0,
    trigger: {
      name: 'signup',
      data: { plan: 'pro' },
      source: 'server',
      timestamp: new Date().toISOString(),
      sequence: 1,
    },
    ...overrides,
  });

  return rest;
}

describe('dryRun', () => {
  it('walks the whole spec, collecting the path, the trace, and the vars', async () => {
    const result = await dryRun(params());

    expect(result.outcome).toBe('completed');
    expect(result.exited).toBe(false);
    expect(result.path).toEqual(['remember', 'pause', 'welcome']);
    expect(result.vars.plan).toBe('pro');
    expect(result.steps.map((entry) => entry.status)).toContain('sleeping');
    expect(result.steps.at(-1)!.summary).toBe('Would send “Hi”');
  });

  it('reports the failing step when a step throws', async () => {
    vi.mocked(findTopicBySlug).mockRejectedValue(new NotFoundError('Topic not found'));

    const result = await dryRun(params());

    expect(result.outcome).toBe('failed');
    expect(result.step).toBe('welcome');
    expect(result.error).toBe('Topic not found');
  });

  it('treats an exit as a completed run', async () => {
    const exiting: WorkflowSpec = {
      trigger: { event: 'signup' },
      steps: [{ exit: true }, { name: 'never', wait: '1h' }],
    };

    const result = await dryRun(params({ spec: exiting }));

    expect(result.outcome).toBe('completed');
    expect(result.exited).toBe(true);
    expect(result.path).toEqual(['exit']);
  });
});
