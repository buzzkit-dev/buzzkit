import { runSet } from '@buzzkit/api/engine/steps/set';
import type { SetStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDryRunContext, createHarness } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn(() => ({})) }));
vi.mock('@buzzkit/api/api/subscribers/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findSubscriberByExternalId: vi.fn(),
  upsertSubscriber: vi.fn(),
}));
vi.mock('@buzzkit/api/api/events/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordSystemEvents: vi.fn(),
  subscriberAttributes: vi.fn((subscriber: { attributes: unknown }) => subscriber.attributes),
}));

import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import { findSubscriberByExternalId, upsertSubscriber } from '@buzzkit/api/api/subscribers/index';

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [] };

beforeEach(() => {
  vi.mocked(findSubscriberByExternalId).mockReset();
  vi.mocked(upsertSubscriber).mockReset();
  vi.mocked(recordSystemEvents).mockReset();
});

describe('runSet', () => {
  it('sets a run variable with a rendered template', async () => {
    const { context, actor } = createHarness(spec, {
      trigger: {
        name: 'signup',
        data: { plan: 'pro' },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });
    const step: SetStep = { name: 'remember', set: { var: 'plan', value: '{{trigger.data.plan}}' } };

    await runSet(context, step);

    expect(context.state.vars.plan).toBe('pro');
    expect(context.state.steps.remember).toMatchObject({ value: 'pro' });
    expect(actor.steps[0]!.summary).toContain('Set plan to');
    expect(findSubscriberByExternalId).not.toHaveBeenCalled();
  });

  it('writes a subscriber attribute and records the update event when it changed', async () => {
    const { context } = createHarness(spec);
    vi.mocked(findSubscriberByExternalId).mockResolvedValue({
      attributes: { plan: 'free', $timezone: 'UTC' },
    } as never);
    vi.mocked(upsertSubscriber).mockResolvedValue({
      subscriber: { id: 1, externalId: 'user_1', attributes: { plan: 'pro' } },
      changed: true,
    } as never);
    const step: SetStep = { name: 'promote', set: { attribute: 'plan', value: 'pro' } };

    await runSet(context, step);

    expect(upsertSubscriber).toHaveBeenCalledWith(expect.anything(), 1, 'user_1', {
      attributes: { plan: 'pro' },
    });
    expect(recordSystemEvents).toHaveBeenCalledTimes(1);
    expect(context.params.attributes.plan).toBe('pro');
  });

  it('removes the attribute when the value is null and skips the event when nothing changed', async () => {
    const { context } = createHarness(spec, { attributes: { plan: 'pro' } });
    vi.mocked(findSubscriberByExternalId).mockResolvedValue({ attributes: { plan: 'pro' } } as never);
    vi.mocked(upsertSubscriber).mockResolvedValue({
      subscriber: { id: 1, externalId: 'user_1', attributes: {} },
      changed: false,
    } as never);
    const step: SetStep = { name: 'clear', set: { attribute: 'plan', value: null } };

    await runSet(context, step);

    expect(upsertSubscriber).toHaveBeenCalledWith(expect.anything(), 1, 'user_1', { attributes: {} });
    expect(recordSystemEvents).not.toHaveBeenCalled();
    expect(context.params.attributes.plan).toBeUndefined();
  });

  it('only describes the write in a dry run', async () => {
    const context = createDryRunContext(spec);
    const step: SetStep = { name: 'promote', set: { attribute: 'plan', value: 'pro' } };

    await runSet(context, step);

    expect(findSubscriberByExternalId).not.toHaveBeenCalled();
    expect(context.trace[0]!.summary).toContain('Would set plan');
  });
});
