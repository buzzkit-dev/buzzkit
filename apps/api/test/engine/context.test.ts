import { NonRetryableError } from 'cloudflare:workflows';
import { NotFoundError } from '@buzzkit/api/libs/error';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDryRunContext, createHarness, waitPayload } from '../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/api/tenants/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTenantById: vi.fn(),
}));

import { findTenantById } from '@buzzkit/api/api/tenants/index';
import { log } from '@buzzkit/api/libs/logger';

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [] };

beforeEach(() => {
  vi.mocked(findTenantById).mockReset();
  vi.mocked(log.warn).mockReset();
});

describe('RunContext', () => {
  it('memoizes the tenant for the lifetime of the wake', async () => {
    const { context } = createHarness(spec);
    vi.mocked(findTenantById).mockResolvedValue({ id: 1 } as never);

    await context.tenant({} as never);
    await context.tenant({} as never);

    expect(findTenantById).toHaveBeenCalledTimes(1);
  });

  it('scopes step names inside loop frames', async () => {
    const { context, workflowStep } = createHarness(spec);

    await context.withLoopFrame('loop#1', async () => {
      await context.do('inner', async () => ({}));
    });
    await context.do('outer', async () => ({}));

    expect(workflowStep.invoked).toEqual(['inner@loop#1', 'outer']);
  });

  it('converts a 4xx ApiError into a NonRetryableError inside do', async () => {
    const { context } = createHarness(spec);

    await expect(
      context.do('boom', async () => {
        throw new NotFoundError('Tenant not found');
      })
    ).rejects.toBeInstanceOf(NonRetryableError);
  });

  it('lets 5xx and unknown failures stay retryable', async () => {
    const { context } = createHarness(spec);

    await expect(
      context.do('boom', async () => {
        throw new Error('transient');
      })
    ).rejects.toThrow('transient');
  });

  it('resolves duration deadlines inline and moment deadlines through a step', async () => {
    const { context, workflowStep } = createHarness(spec);
    context.current = 'confirm';

    const fromDuration = await context.deadline('2h');
    const fromMoment = await context.deadline({ delay: '1h' });

    expect(fromDuration - context.now()).toBeGreaterThan(2 * 60 * 60 * 1000 - 1000);
    expect(fromMoment).toBeGreaterThan(Date.now());
    expect(workflowStep.invoked).toContain('confirm:deadline');
  });

  it('evaluates expressions locally when the run has no subscriber', async () => {
    const { context, actor } = createHarness(spec, {
      subscriberId: 0,
      trigger: {
        name: 'signup',
        data: { plan: 'pro' },
        source: 'server',
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    const matched = await context.evaluate({ ref: 'trigger.data.plan', eq: 'pro' });

    expect(matched).toBe(true);
    expect(actor.evaluated).toHaveLength(0);
  });

  it('delegates expression evaluation to the actor when a subscriber exists', async () => {
    const { context, actor } = createHarness(spec);
    actor.evaluations = [true];

    const matched = await context.evaluate({ ref: 'trigger.name', eq: 'signup' });

    expect(matched).toBe(true);
    expect(actor.evaluated).toHaveLength(1);
  });

  it('returns the scripted payload from listen and swallows the timeout quietly', async () => {
    const { context, workflowStep } = createHarness(spec);
    workflowStep.scriptEvent('evt:confirm', waitPayload('order.paid'));

    const arrived = await context.listen('confirm', 'confirm:wait', 60_000);
    const timedOut = await context.listen('confirm', 'confirm:wait', 60_000);

    expect(arrived?.name).toBe('order.paid');
    expect(timedOut).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns when the wait listener fails for a non-timeout reason', async () => {
    const { context, workflowStep } = createHarness(spec);
    workflowStep.waitForEvent = async () => {
      throw new Error('durable object unreachable');
    };

    const outcome = await context.listen('confirm', 'confirm:wait', 60_000);

    expect(outcome).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      '[Engine] Wait listener failed',
      expect.objectContaining({ step: 'confirm', tenantId: 1 })
    );
  });

  it('carries the run identity attributes for step spans', () => {
    const { context } = createHarness(spec);

    expect(context.runIdentity()).toMatchObject({
      service: 'buzzkit-workflows',
      workflow: 'welcome',
      attributes: expect.objectContaining({ 'tenant.id': 1, 'subscriber.id': 1 }),
    });
  });

  it('collects reports into the trace in a dry run and advances its clock on sleep', async () => {
    const context = createDryRunContext(spec);
    const before = context.now();

    await context.report('step', 'completed', 'Done', { extra: 1 });
    await context.sleep('step:sleep', 60_000);

    expect(context.trace[0]).toMatchObject({ step: 'step', status: 'completed', summary: 'Done' });
    expect(context.now() - before).toBe(60_000);
  });

  it('answers assumptions and exposes rendering context', () => {
    const context = createDryRunContext(spec, { assume: { confirm: { matched: true } } });

    expect(context.assumption('confirm')).toEqual({ matched: true });
    expect(context.assumption('other')).toBeNull();
    expect(context.rendering().timezone).toBeDefined();
  });

  it('detects the need for subscriber facets from the spec text', () => {
    const plain = createDryRunContext(spec);
    const needing = createDryRunContext({
      trigger: { event: 'signup' },
      steps: [
        {
          name: 'route',
          branch: [{ name: 'push', when: { ref: 'subscriber.channels.push', eq: true }, steps: [] }],
        },
      ],
    });

    expect(plain.needsSubscriberFacets).toBe(false);
    expect(needing.needsSubscriberFacets).toBe(true);
  });

  it('returns the assumed payload from listen in a dry run', async () => {
    const context = createDryRunContext(spec, { assume: { confirm: { matched: true, data: { n: 1 } } } });

    const outcome = await context.listen('confirm', 'confirm:wait', 1000);

    expect(outcome).toMatchObject({ name: 'assumed', dataJson: '{"n":1}' });
  });

  it('refuses Workflow primitives in a dry run', async () => {
    const context = createDryRunContext(spec);

    await expect(context.listen('confirm', 'x', 1000)).resolves.toBeNull();
    expect(() => context.scaled(500)).not.toThrow();
  });
});
