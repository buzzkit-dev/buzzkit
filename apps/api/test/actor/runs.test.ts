import { acceptEvent } from '@buzzkit/api/actor/ingest';
import { advanceRuns, type RunPorts, runIdFor, scheduleRun } from '@buzzkit/api/actor/runs';
import type { ActorDefinitions, ActorEventInput, ActorIdentity } from '@buzzkit/api/actor/types';
import { describe, expect, it, vi } from 'vitest';
import { createActorStore } from '../utils/actorStore';

const identity: ActorIdentity = { tenantId: 1, subscriberId: 2, externalId: 'user_2' };

function event(name: string, overrides: Partial<ActorEventInput> = {}): ActorEventInput {
  return {
    id: `evt_${name}_${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: null,
    name,
    source: 'server',
    timestamp: '2026-08-29T10:00:00.000Z',
    receivedAt: '2026-08-29T10:00:00.000Z',
    data: {},
    ...overrides,
  };
}

function definitions(overrides: Partial<ActorDefinitions['workflows'][number]> = {}): ActorDefinitions {
  return {
    version: 1,
    workflows: [
      {
        id: 'wf_trial',
        slug: 'trial',
        status: 'active',
        versionId: 'wfv_1',
        spec: {
          trigger: {
            event: 'trial.started',
            sources: ['server'],
            where: { ref: 'trigger.data.plan', eq: 'monthly' },
          },
          concurrency: 'one-per-subscriber',
          cancelOn: [{ event: 'subscription.started' }],
          steps: [{ name: 'settle', wait: '2h' }],
        },
        ...overrides,
      },
    ],
  };
}

function ports(): RunPorts & {
  createRun: ReturnType<typeof vi.fn>;
  terminateRun: ReturnType<typeof vi.fn>;
  deliverWait: ReturnType<typeof vi.fn>;
} {
  return {
    createRun: vi.fn(async () => {}),
    terminateRun: vi.fn(async () => {}),
    deliverWait: vi.fn(async () => {}),
  };
}

function runEvents(store: ReturnType<typeof createActorStore>['store']) {
  return store
    .listRecent(50)
    .filter((row) => row.name.startsWith('$run.'))
    .reverse()
    .map((row) => `${row.name}:${(JSON.parse(row.data) as { reason?: string }).reason ?? ''}`);
}

describe('advanceRuns', () => {
  it('starts a run when the trigger, its sources and its conditions match', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    const trigger = event('trial.started', { data: { plan: 'monthly' } });
    const outcome = await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: trigger, sequence: 4 }],
      hooks
    );

    const runId = runIdFor(identity, 'wf_trial', 4);
    expect(outcome).toEqual({ started: [runId], canceled: [], delivered: [] });
    expect(store.findRun(runId)).toMatchObject({
      status: 'running',
      workflow_slug: 'trial',
      version_id: 'wfv_1',
      trigger_sequence: 4,
    });
    expect(hooks.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: runId }),
      expect.objectContaining({ id: 'wf_trial' }),
      trigger,
      4
    );
    expect(runEvents(store)).toEqual(['$run.started:']);
  });

  it('ignores events that miss the trigger name, source or conditions, and paused workflows', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    const misses = [
      { event: event('trial.ended'), sequence: 1 },
      { event: event('trial.started', { data: { plan: 'monthly' }, source: 'ios' }), sequence: 2 },
      { event: event('trial.started', { data: { plan: 'yearly' } }), sequence: 3 },
      { event: event('$run.started', { data: { plan: 'monthly' } }), sequence: 4 },
    ];
    expect(await advanceRuns(store, identity, definitions(), misses, hooks)).toEqual({
      started: [],
      canceled: [],
      delivered: [],
    });
    expect(
      await advanceRuns(
        store,
        identity,
        definitions({ status: 'paused' }),
        [{ event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 5 }],
        hooks
      )
    ).toEqual({ started: [], canceled: [], delivered: [] });
    expect(hooks.createRun).not.toHaveBeenCalled();
    expect(store.listLiveRuns()).toEqual([]);
  });

  it('keeps one live run per subscriber and never starts the same trigger twice', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    const first = { event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 1 };
    await advanceRuns(store, identity, definitions(), [first], hooks);
    await advanceRuns(store, identity, definitions(), [first], hooks);
    const second = await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 2 }],
      hooks
    );
    expect(second.started).toEqual([]);
    expect(hooks.createRun).toHaveBeenCalledTimes(1);

    store.updateRun(
      runIdFor(identity, 'wf_trial', 1),
      'completed',
      'settle',
      null,
      '2026-08-29T12:00:00.000Z'
    );
    const third = await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 3 }],
      hooks
    );
    expect(third.started).toEqual([runIdFor(identity, 'wf_trial', 3)]);
  });

  it('cancels live runs on a cancel rule and when the workflow disappears from the definitions', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 1 }],
      hooks
    );
    const canceled = await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('subscription.started'), sequence: 2 }],
      hooks
    );
    const runId = runIdFor(identity, 'wf_trial', 1);
    expect(canceled.canceled).toEqual([runId]);
    expect(hooks.terminateRun).toHaveBeenCalledWith(runId);
    expect(store.findRun(runId)?.status).toBe('canceled');
    expect(runEvents(store)).toEqual(['$run.started:', '$run.canceled:cancelOn:subscription.started']);

    await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('trial.started', { data: { plan: 'monthly' } }), sequence: 3 }],
      hooks
    );
    const gone = await advanceRuns(
      store,
      identity,
      { version: 2, workflows: [] },
      [{ event: event('app.opened'), sequence: 4 }],
      hooks
    );
    expect(gone.canceled).toEqual([runIdFor(identity, 'wf_trial', 3)]);
    expect(runEvents(store).at(-1)).toBe('$run.canceled:workflow_deleted');
  });

  it('delivers a registered wait once when its event and condition match, then forgets it', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    store.insertRun({
      run_id: 'run_1',
      workflow_id: 'wf_trial',
      workflow_slug: 'trial',
      version_id: 'wfv_1',
      status: 'waiting',
      step: 'cancel',
      detail: null,
      trigger_sequence: 1,
      started_at: '2026-08-29T10:00:00.000Z',
      updated_at: '2026-08-29T10:00:00.000Z',
    });
    store.insertWait({
      run_id: 'run_1',
      step: 'cancel',
      event: 'trial.canceled',
      condition: JSON.stringify({ ref: 'event.data.reason', eq: 'price' }),
      expires_at: '2026-09-01T00:00:00.000Z',
    });

    const wrong = await advanceRuns(
      store,
      identity,
      definitions(),
      [{ event: event('trial.canceled', { data: { reason: 'bugs' } }), sequence: 2 }],
      hooks
    );
    expect(wrong.delivered).toEqual([]);
    const match = event('trial.canceled', { data: { reason: 'price' } });
    const right = await advanceRuns(store, identity, definitions(), [{ event: match, sequence: 3 }], hooks);
    expect(right.delivered).toEqual(['run_1']);
    expect(hooks.deliverWait).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 'run_1', step: 'cancel' }),
      match
    );
    expect(store.listWaitsFor('trial.canceled', '2026-08-29T10:00:00.000Z')).toEqual([]);

    const expired = await advanceRuns(
      store,
      identity,
      definitions(),
      [
        {
          event: event('trial.canceled', {
            data: { reason: 'price' },
            receivedAt: '2026-09-02T00:00:00.000Z',
          }),
          sequence: 4,
        },
      ],
      hooks
    );
    expect(expired.delivered).toEqual([]);
  });

  it("answers history conditions in triggers and waits from the subscriber's own events", async () => {
    const { store } = createActorStore();
    const hooks = ports();
    const defs = definitions({
      spec: {
        trigger: { event: 'workout.completed', where: { count: 'workout.completed', within: '1d', gte: 2 } },
        concurrency: 'per-event',
        steps: [{ name: 'settle', wait: '2h' }],
      },
    });
    const stamp = (timestamp: string) => ({ timestamp, receivedAt: timestamp });

    acceptEvent(store, event('workout.completed', stamp('2026-08-29T09:00:00.000Z')));
    const second = event('workout.completed', stamp('2026-08-29T10:00:00.000Z'));
    const { sequence } = acceptEvent(store, second);
    const started = await advanceRuns(store, identity, defs, [{ event: second, sequence }], hooks);
    expect(started.started).toHaveLength(1);

    const lonely = event('workout.completed', stamp('2026-09-30T10:00:00.000Z'));
    const { sequence: lonelySequence } = acceptEvent(store, lonely);
    const skipped = await advanceRuns(
      store,
      identity,
      defs,
      [{ event: lonely, sequence: lonelySequence }],
      hooks
    );
    expect(skipped.started).toEqual([]);

    const startedAt = '2026-08-29T10:00:00.000Z';
    store.insertRun({
      run_id: 'run_h',
      workflow_id: 'wf_trial',
      workflow_slug: 'trial',
      version_id: 'wfv_1',
      status: 'waiting',
      step: 'cancel',
      detail: null,
      trigger_sequence: sequence,
      started_at: startedAt,
      updated_at: startedAt,
    });
    store.insertWait({
      run_id: 'run_h',
      step: 'cancel',
      event: 'trial.canceled',
      condition: JSON.stringify({ occurred: 'workout.completed', since: 'trigger' }),
      expires_at: '2026-12-01T00:00:00.000Z',
    });
    const cancel = event('trial.canceled', stamp('2026-10-01T00:00:00.000Z'));
    const { sequence: cancelSequence } = acceptEvent(store, cancel);
    const delivered = await advanceRuns(
      store,
      identity,
      defs,
      [{ event: cancel, sequence: cancelSequence }],
      hooks
    );
    expect(delivered.delivered).toEqual(['run_h']);
  });

  it('starts a scheduled run once per fire, honoring where and concurrency', async () => {
    const { store } = createActorStore();
    const hooks = ports();
    const definition = definitions({
      id: 'wf_streak',
      slug: 'streak',
      spec: {
        trigger: {
          schedule: { daily: '19:00' },
          timezone: 'subscriber',
          where: { count: 'workout.completed', since: 'localMidnight', eq: 0 },
        },
        concurrency: 'one-per-subscriber',
        steps: [{ name: 'nudge', send: { title: 'Log a workout' } }],
      },
    }).workflows[0]!;
    store.writeAttributes({ $timezone: 'Europe/Berlin' });
    const zone = 'Europe/Berlin';
    const first = { at: '2026-08-29T17:00:00.000Z', zone };

    expect(await scheduleRun(store, identity, definition, first, hooks)).toBe('started');
    expect(hooks.createRun).toHaveBeenCalledTimes(1);
    const runId = `1-wf_streak-2-${Date.parse(first.at)}`;
    expect(hooks.createRun.mock.calls[0]?.[0]).toMatchObject({ run_id: runId, status: 'running' });
    expect(hooks.createRun.mock.calls[0]?.[2]).toMatchObject({
      name: '$schedule',
      source: 'system',
      timestamp: first.at,
      data: { firedAt: first.at, zone },
    });
    expect(await scheduleRun(store, identity, definition, first, hooks)).toBe('duplicate');

    const second = { at: '2026-08-30T17:00:00.000Z', zone };
    expect(await scheduleRun(store, identity, definition, second, hooks)).toBe('skipped');
    store.updateRun(runId, 'completed', null, null, '2026-08-29T17:05:00.000Z');
    acceptEvent(
      store,
      event('workout.completed', {
        timestamp: '2026-08-30T10:00:00.000Z',
        receivedAt: '2026-08-30T10:00:00.000Z',
      })
    );
    expect(await scheduleRun(store, identity, definition, second, hooks)).toBe('skipped');
    expect(
      await scheduleRun(store, identity, definition, { at: '2026-08-31T17:00:00.000Z', zone }, hooks)
    ).toBe('started');
    expect(runEvents(store).filter((item) => item.startsWith('$run.started'))).toHaveLength(2);
    expect(hooks.createRun).toHaveBeenCalledTimes(2);
  });
});
