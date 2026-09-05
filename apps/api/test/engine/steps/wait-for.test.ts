import { runWaitFor } from '@buzzkit/api/engine/steps/wait-for';
import type { WaitForStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { describe, expect, it, vi } from 'vitest';
import { createDryRunContext, createHarness, waitPayload } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const step: WaitForStep = {
  name: 'confirm',
  waitFor: { event: 'order.paid', timeout: '2d' },
};

const spec: WorkflowSpec = { trigger: { event: 'order.created' }, steps: [step] };

describe('runWaitFor', () => {
  it('registers the wait, receives the event, and settles matched', async () => {
    const { context, actor, workflowStep } = createHarness(spec);
    workflowStep.scriptEvent('evt:confirm', waitPayload('order.paid', { total: 42 }));

    await runWaitFor(context, step);

    expect(actor.waits).toHaveLength(1);
    expect(actor.waits[0]).toMatchObject({ step: 'confirm', event: 'order.paid' });
    expect(actor.deregistered).toEqual([{ runId: context.params.runId, step: 'confirm' }]);
    expect(context.state.steps.confirm).toMatchObject({
      matched: true,
      event: 'order.paid',
      data: { total: 42 },
    });
    expect(actor.steps.map((entry) => entry.status)).toEqual(['waiting', 'completed']);
  });

  it('settles unmatched when the timeout passes', async () => {
    const { context, actor, workflowStep } = createHarness(spec);
    workflowStep.scriptEvent('evt:confirm', 'timeout');

    await runWaitFor(context, step);

    expect(context.state.steps.confirm).toMatchObject({ matched: false, event: null, data: null });
    expect(actor.steps.at(-1)!.summary).toBe('No order.paid in time');
  });

  it('registers and reports an endOn event as ended, not matched', async () => {
    const ending: WaitForStep = {
      name: 'confirm',
      waitFor: { event: 'order.paid', timeout: '2d', endOn: [{ event: 'order.canceled' }] },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [ending] });
    workflowStep.scriptEvent('evt:confirm', waitPayload('order.canceled'));

    await runWaitFor(context, ending);

    expect(actor.waits.map((wait) => wait.event)).toEqual(['order.paid', 'order.canceled']);
    expect(context.state.steps.confirm).toMatchObject({ matched: false, endedBy: 'order.canceled' });
    expect(actor.steps.at(-1)!.summary).toBe('Ended by order.canceled');
  });

  it('waits out the settle window after the event before completing', async () => {
    const settling: WaitForStep = {
      name: 'confirm',
      waitFor: { event: 'cart.updated', timeout: '1d', settleFor: '30m', resetOn: ['cart.updated'] },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [settling] });
    const arrival = waitPayload('cart.updated', {}, new Date(Date.now() - 31 * 60 * 1000).toISOString());
    workflowStep.scriptEvent('evt:confirm', arrival);
    actor.quietAnchorAnswers = [null];

    await runWaitFor(context, settling);

    expect(context.state.steps.confirm).toMatchObject({ matched: true, event: 'cart.updated' });
  });

  it('matches at once from an earlier occurrence whose quiet window already elapsed', async () => {
    const settling: WaitForStep = {
      name: 'confirm',
      waitFor: { event: 'cart.updated', timeout: '1d', settleFor: '30m' },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [settling] });
    const earlier = waitPayload(
      'cart.updated',
      { total: 42 },
      new Date(Date.now() - 31 * 60 * 1000).toISOString()
    );
    actor.quietAnchorAnswers = [earlier];

    await runWaitFor(context, settling);

    expect(context.state.steps.confirm).toMatchObject({
      matched: true,
      event: 'cart.updated',
      data: { total: 42 },
    });
    expect(workflowStep.invoked.some((name) => name.startsWith('confirm:listen'))).toBe(false);
    expect(actor.steps.at(-1)!.summary).toBe('Received cart.updated');
  });

  it('waits out the remaining quiet window of an earlier occurrence, then matches', async () => {
    const settling: WaitForStep = {
      name: 'confirm',
      waitFor: { event: 'cart.updated', timeout: '1d', settleFor: '30m', resetOn: ['cart.opened'] },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [settling] });
    const earlier = waitPayload('cart.updated', {}, new Date(Date.now() - 5 * 60 * 1000).toISOString());
    actor.quietAnchorAnswers = [earlier];
    workflowStep.scriptEvent('evt:confirm', 'timeout');

    await runWaitFor(context, settling);

    expect(workflowStep.invoked.some((name) => name.startsWith('confirm:watch'))).toBe(true);
    expect(actor.waits.some((wait) => wait.event === 'cart.opened')).toBe(true);
    expect(context.state.steps.confirm).toMatchObject({ matched: true, event: 'cart.updated' });
  });

  it('re-arms the reset watch when activity interrupts the quiet window', async () => {
    const settling: WaitForStep = {
      name: 'confirm',
      waitFor: { event: 'cart.updated', timeout: '1d', settleFor: '30m', resetOn: ['cart.updated'] },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [settling] });
    const earlier = waitPayload('cart.updated', {}, new Date(Date.now() - 5 * 60 * 1000).toISOString());
    actor.quietAnchorAnswers = [earlier, null];
    workflowStep.scriptEvent('evt:confirm', waitPayload('cart.updated'), 'timeout');

    await runWaitFor(context, settling);

    expect(workflowStep.invoked.some((name) => name.startsWith('confirm:watch'))).toBe(true);
    expect(actor.waits.filter((wait) => wait.event === 'cart.updated').length).toBeGreaterThan(1);
    expect(context.state.steps.confirm).toMatchObject({ matched: false });
  });

  it('hands the reset conditions to the actor and registers them on the reset watch', async () => {
    const settling: WaitForStep = {
      name: 'confirm',
      waitFor: {
        event: '$app.backgrounded',
        timeout: '1d',
        settleFor: '30m',
        resetOn: [
          '$session.ended',
          { event: '$app.opened', where: { ref: 'event.data.screen', neq: 'widget' } },
        ],
      },
    };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [settling] });
    const earlier = waitPayload('$app.backgrounded', {}, new Date(Date.now() - 5 * 60 * 1000).toISOString());
    actor.quietAnchorAnswers = [earlier];
    workflowStep.scriptEvent('evt:confirm', 'timeout');

    await runWaitFor(context, settling);

    expect(actor.quietAnchorAsked).toEqual([
      {
        after: '$app.backgrounded',
        unless: [
          { event: '$session.ended' },
          { event: '$app.opened', where: { ref: 'event.data.screen', neq: 'widget' } },
        ],
        timezone: context.timezone(),
      },
    ]);
    expect(actor.waits.map((wait) => [wait.event, wait.condition])).toEqual([
      ['$app.backgrounded', null],
      ['$session.ended', null],
      ['$app.opened', { ref: 'event.data.screen', neq: 'widget' }],
    ]);
    expect(context.state.steps.confirm).toMatchObject({ matched: true, event: '$app.backgrounded' });
  });

  it('assumes the outcome in a dry run', async () => {
    const context = createDryRunContext(spec, {
      assume: { confirm: { matched: true, data: { total: 7 } } },
    });

    await runWaitFor(context, step);

    expect(context.state.steps.confirm).toMatchObject({ matched: true, data: { total: 7 } });
    expect(context.trace.map((entry) => entry.status)).toEqual(['waiting', 'completed']);
  });

  it('assumes silence in a dry run without an assumption', async () => {
    const context = createDryRunContext(spec);

    await runWaitFor(context, step);

    expect(context.state.steps.confirm).toMatchObject({ matched: false });
  });
});
