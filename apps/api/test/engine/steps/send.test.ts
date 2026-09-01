import { runLocalWindow, runSend } from '@buzzkit/api/engine/steps/send';
import type { SendStep, WaitUntilStep, WorkflowSpec } from '@buzzkit/schema/workflows';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDryRunContext, createHarness, fakeSelectDb } from '../../utils/engineHarness';

vi.mock('agents', () => ({
  getAgentByName: async () => (await import('../../utils/engineHarness')).activeActor(),
}));
vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/libs/database', () => ({ stepDb: vi.fn(() => ({})) }));
vi.mock('@buzzkit/api/api/tenants/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTenantById: vi.fn(),
}));
vi.mock('@buzzkit/api/api/messages/index', () => ({
  createMessage: vi.fn(),
  enqueueFanout: vi.fn(),
}));
vi.mock('@buzzkit/api/api/topics/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findTopicBySlug: vi.fn(),
}));

import { createMessage, enqueueFanout } from '@buzzkit/api/api/messages/index';
import { findTenantById } from '@buzzkit/api/api/tenants/index';
import { findTopicBySlug } from '@buzzkit/api/api/topics/index';
import { stepDb } from '@buzzkit/api/libs/database';

const step: SendStep = {
  name: 'welcome',
  send: { title: 'Welcome {{subscriber.attributes.name}}', body: 'Glad you are here' },
};

const spec: WorkflowSpec = { trigger: { event: 'signup' }, steps: [step] };

function tenant(settings: Record<string, unknown> = {}) {
  return { id: 1, slug: 'default', settings } as never;
}

beforeEach(() => {
  vi.mocked(findTenantById).mockReset().mockResolvedValue(tenant());
  vi.mocked(createMessage)
    .mockReset()
    .mockResolvedValue({ message: { id: 77 } } as never);
  vi.mocked(enqueueFanout).mockReset();
  vi.mocked(findTopicBySlug).mockReset();
  vi.mocked(stepDb).mockReturnValue({} as never);
});

describe('runSend', () => {
  it('renders the payload, creates the message, and fans out', async () => {
    const { context, actor } = createHarness(spec, { attributes: { name: 'Ada' } });

    await runSend(context, step);

    expect(createMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({
        to: ['user_1'],
        title: 'Welcome Ada',
        body: 'Glad you are here',
        idempotencyKey: `${context.params.runId}:welcome`,
        run: { id: context.params.runId, step: 'welcome' },
      })
    );
    expect(enqueueFanout).toHaveBeenCalledWith(77);
    expect(context.state.steps.welcome).toMatchObject({ skipped: false });
    expect(actor.steps[0]!.summary).toBe('Sent “Welcome Ada”');
  });

  it('skips when an equivalent message went out inside the window', async () => {
    const { context, actor } = createHarness(spec);
    vi.mocked(stepDb).mockReturnValue(fakeSelectDb([{ id: 1 }]) as never);
    const guarded: SendStep = { name: 'welcome', send: { ...step.send, skipIfSentWithin: '1d' } };

    await runSend(context, guarded);

    expect(createMessage).not.toHaveBeenCalled();
    expect(context.state.steps.welcome).toMatchObject({ skipped: true });
    expect(actor.steps[0]).toMatchObject({ status: 'skipped' });
  });

  it('sends anyway on the fallback pass of a local window', async () => {
    const { context } = createHarness(spec);
    vi.mocked(stepDb).mockReturnValue(fakeSelectDb([{ id: 1 }]) as never);
    const guarded: SendStep = { name: 'welcome', send: { ...step.send, skipIfSentWithin: '1d' } };

    await runSend(context, guarded, { fallback: true });

    expect(createMessage).toHaveBeenCalledTimes(1);
    const summary = (await import('../../utils/engineHarness')).activeActor().steps[0]!.summary;
    expect(summary).toBe('No device confirmed the local schedule; sent as a push instead');
  });

  it('schedules a local delivery with the run-scoped id and cancel events', async () => {
    const local: SendStep = { name: 'remind', send: { ...step.send, deliver: 'local' } };
    const cancelSpec: WorkflowSpec = {
      ...spec,
      cancelOn: [{ event: 'workout.completed' }, { event: 'maybe', where: { ref: 'x', eq: 1 } }],
      steps: [local],
    };
    const { context } = createHarness(cancelSpec);

    await runSend(context, local);

    const payload = vi.mocked(createMessage).mock.calls[0]![2] as Record<string, unknown>;
    expect(payload.deliver).toBe('local');
    expect(payload.local).toMatchObject({
      id: `${context.params.runId}:remind`,
      cancelOn: ['workout.completed'],
    });
  });

  it('passes every optional payload field through rendered', async () => {
    const rich: SendStep = {
      name: 'welcome',
      send: {
        channel: 'push',
        subtitle: 'Sub {{subscriber.externalId}}',
        body: 'B',
        data: { k: '{{trigger.name}}' },
        imageUrl: 'https://cdn/x.png',
        sound: 'ping',
        badge: 2,
        threadId: 'thread-{{trigger.name}}',
        collapseId: 'c-{{trigger.name}}',
        interruptionLevel: 'active',
        relevanceScore: 0.5,
        priority: 'normal',
        deepLink: 'app://{{trigger.name}}',
        action: { name: 'open', data: { tab: '{{trigger.name}}' } },
        actions: [{ id: 'a', title: 'A' }],
        policy: 'ignore',
      },
    };
    const { context, actor } = createHarness({ ...spec, steps: [rich] });

    await runSend(context, rich);

    const payload = vi.mocked(createMessage).mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).toMatchObject({
      channel: 'push',
      subtitle: 'Sub user_1',
      data: { k: 'signup' },
      threadId: 'thread-signup',
      collapseId: 'c-signup',
      interruptionLevel: 'active',
      relevanceScore: 0.5,
      priority: 'normal',
      deepLink: 'app://signup',
      action: { name: 'open', data: { tab: 'signup' } },
      policy: 'ignore',
    });
    expect(actor.steps[0]!.summary).toBe('Sent a message');
  });

  it('summarizes an untitled immediate local schedule on the device', async () => {
    const local: SendStep = { name: 'remind', send: { body: 'B', deliver: 'local' } };
    const { context, actor } = createHarness({ ...spec, steps: [local] });

    await runSend(context, local);

    expect(actor.steps[0]!.summary).toBe('Scheduled a local notification on the device');
  });

  it('validates the topic but sends nothing in a dry run', async () => {
    const context = createDryRunContext(spec);
    const topical: SendStep = { name: 'welcome', send: { ...step.send, topic: 'promos' } };

    await runSend(context, topical);

    expect(findTopicBySlug).toHaveBeenCalledWith(expect.anything(), 1, 'promos');
    expect(createMessage).not.toHaveBeenCalled();
    expect(context.trace[0]!.summary).toContain('Would send');
  });
});

const windowStep: WaitUntilStep = { name: 'window', waitUntil: { time: '19:00', timezone: 'subscriber' } };

describe('runLocalWindow', () => {
  it('schedules locally, sleeps to the window, and skips the fallback when a device acked', async () => {
    const localSend: SendStep = { name: 'remind', send: { ...step.send, deliver: 'local' } };
    const { context, actor, workflowStep } = createHarness({ ...spec, steps: [windowStep, localSend] });
    actor.localScheduled.add(`${context.params.runId}:remind`);

    await runLocalWindow(context, windowStep, localSend);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(workflowStep.sleeps.some((sleep) => sleep.name === 'window:sleep')).toBe(true);
    expect(actor.steps.filter((entry) => entry.step === 'remind')).toHaveLength(1);
  });

  it('falls back to a push when no device confirmed the schedule', async () => {
    const localSend: SendStep = { name: 'remind', send: { ...step.send, deliver: 'local' } };
    const { context, actor } = createHarness({ ...spec, steps: [windowStep, localSend] });

    await runLocalWindow(context, windowStep, localSend);

    expect(createMessage).toHaveBeenCalledTimes(2);
    const keys = vi
      .mocked(createMessage)
      .mock.calls.map((call) => (call[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[1]).toBe(`${context.params.runId}:remind:fallback`);
    expect(actor.steps.filter((entry) => entry.step === 'remind')).toHaveLength(2);
  });

  it('shifts the window out of the tenant quiet hours unless the send ignores policy', async () => {
    vi.mocked(findTenantById).mockResolvedValue(
      tenant({ sendPolicy: { quietHours: { from: '18:00', to: '20:00', timezone: 'UTC' } } })
    );
    const localSend: SendStep = { name: 'remind', send: { ...step.send, deliver: 'local' } };
    const { context, workflowStep, actor } = createHarness({ ...spec, steps: [windowStep, localSend] });
    actor.localScheduled.add(`${context.params.runId}:remind`);

    await runLocalWindow(
      context,
      { name: 'window', waitUntil: { time: '19:00', timezone: 'UTC' } },
      localSend
    );

    const detail = actor.steps.find((entry) => entry.step === 'window')!.detail as { until: string };
    expect(new Date(detail.until).getUTCHours()).toBe(20);
    expect(workflowStep.sleeps.some((sleep) => sleep.name === 'window:sleep')).toBe(true);
  });

  it('leaves the window alone when the send ignores policy', async () => {
    vi.mocked(findTenantById).mockResolvedValue(
      tenant({ sendPolicy: { quietHours: { from: '18:00', to: '20:00', timezone: 'UTC' } } })
    );
    const ignoring: SendStep = { name: 'remind', send: { ...step.send, deliver: 'local', policy: 'ignore' } };
    const { context, actor } = createHarness({ ...spec, steps: [windowStep, ignoring] });
    actor.localScheduled.add(`${context.params.runId}:remind`);

    await runLocalWindow(
      context,
      { name: 'window', waitUntil: { time: '19:00', timezone: 'UTC' } },
      ignoring
    );

    const detail = actor.steps.find((entry) => entry.step === 'window')!.detail as { until: string };
    expect(new Date(detail.until).getUTCHours()).toBe(19);
  });
});
