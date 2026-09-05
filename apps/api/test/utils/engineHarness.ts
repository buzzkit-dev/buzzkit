import { NonRetryableError } from 'cloudflare:workflows';
import type { ActorRunFinish, ActorStepRecord } from '@buzzkit/api/actor/types';
import { RunContext } from '@buzzkit/api/engine/context';
import type { RunParams, WaitPayload } from '@buzzkit/api/engine/types';
import type { EventMatcher, WorkflowExpression, WorkflowSpec } from '@buzzkit/schema/workflows';

export type RegisteredWait = {
  runId: string;
  step: string;
  event: string;
  condition: unknown;
  expiresAt: string;
};

export class FakeActor {
  steps: ActorStepRecord[] = [];
  waits: RegisteredWait[] = [];
  deregistered: Array<{ runId: string; step: string }> = [];
  finished: ActorRunFinish | null = null;
  localScheduled = new Set<string>();
  evaluations: boolean[] = [];
  evaluated: WorkflowExpression[] = [];
  quietAnchorAnswers: Array<WaitPayload | null> = [];
  quietAnchorAsked: Array<{ after: string; unless: EventMatcher[]; timezone: string }> = [];

  evaluate(
    _runId: string,
    expression: WorkflowExpression,
    _scope: unknown,
    _timezone: string,
    _iterationStartedAt: string | null
  ): boolean {
    this.evaluated.push(expression);
    return this.evaluations.shift() ?? false;
  }

  recordStep(_runId: string, record: ActorStepRecord): void {
    this.steps.push(record);
  }

  finishRun(_runId: string, finish: ActorRunFinish): void {
    this.finished = finish;
  }

  hasLocalScheduled(localId: string): boolean {
    return this.localScheduled.has(localId);
  }

  quietAnchor(after: string, unless: EventMatcher[], timezone: string): WaitPayload | null {
    this.quietAnchorAsked.push({ after, unless, timezone });
    return this.quietAnchorAnswers.shift() ?? null;
  }

  registerWait(runId: string, step: string, event: string, condition: unknown, expiresAt: string): void {
    this.waits.push({ runId, step, event, condition, expiresAt });
  }

  deregisterWait(runId: string, step: string): void {
    this.deregistered.push({ runId, step });
  }
}

let active: FakeActor | null = null;

export function activeActor(): FakeActor {
  if (!active) throw new Error('No engine harness is active');
  return active;
}

export function activateActor(): FakeActor {
  active = new FakeActor();
  return active;
}

export type ScriptedWait = WaitPayload | 'timeout';

type StepFunction<T> = (() => Promise<T>) | ((config: unknown) => Promise<T>);

export class FakeWorkflowStep {
  sleeps: Array<{ name: string; ms: number }> = [];
  invoked: string[] = [];

  constructor(private events: Map<string, ScriptedWait[]> = new Map()) {}

  scriptEvent(type: string, ...entries: ScriptedWait[]): void {
    this.events.set(type, [...(this.events.get(type) ?? []), ...entries]);
  }

  async do<T>(name: string, configOrFn: unknown, maybeFn?: StepFunction<T>): Promise<T> {
    const fn = (typeof configOrFn === 'function' ? configOrFn : maybeFn) as () => Promise<T>;
    const config =
      typeof configOrFn === 'function' ? undefined : (configOrFn as { retries?: { limit: number } });
    this.invoked.push(name);

    const limit = config?.retries?.limit ?? 0;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof NonRetryableError || attempt >= limit) throw error;
      }
    }
  }

  async sleep(name: string, ms: number): Promise<void> {
    this.sleeps.push({ name, ms });
  }

  async waitForEvent<T>(_label: string, options: { type: string; timeout: number }): Promise<{ payload: T }> {
    const queue = this.events.get(options.type);
    const next = queue?.shift();
    if (!next || next === 'timeout') {
      throw new Error(`Timed out while waiting for event ${options.type}`);
    }
    return { payload: next as T };
  }
}

export function waitPayload(name: string, data: Record<string, unknown> = {}, at?: string): WaitPayload {
  return {
    name,
    dataJson: JSON.stringify(data),
    timestamp: at ?? new Date().toISOString(),
    id: `evt_${name}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function runParams(spec: WorkflowSpec, overrides: Partial<RunParams> = {}): RunParams {
  return {
    runId: '1-wf_1-1-1',
    tenantId: 1,
    subscriberId: 1,
    externalId: 'user_1',
    workflowId: 'wf_1',
    workflowSlug: 'welcome',
    versionId: 'wfv_1',
    spec,
    trigger: {
      name: 'signup',
      data: {},
      source: 'server',
      timestamp: new Date().toISOString(),
      sequence: 1,
    },
    attributes: {},
    ...overrides,
  };
}

export type EngineHarness = {
  context: RunContext;
  actor: FakeActor;
  workflowStep: FakeWorkflowStep;
  flushes: Promise<unknown>[];
};

export function createHarness(spec: WorkflowSpec, overrides: Partial<RunParams> = {}): EngineHarness {
  const actor = new FakeActor();
  active = actor;

  const workflowStep = new FakeWorkflowStep();
  const flushes: Promise<unknown>[] = [];
  const env = { WORKFLOW_TIME_SCALE: '1', SUBSCRIBER_ACTOR: {} } as unknown as Env;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => flushes.push(promise),
  } as unknown as ExecutionContext;
  const context = new RunContext(
    env,
    ctx,
    runParams(spec, overrides),
    workflowStep as unknown as ConstructorParameters<typeof RunContext>[3]
  );

  return { context, actor, workflowStep, flushes };
}

export function createDryRunContext(spec: WorkflowSpec, overrides: Partial<RunParams> = {}): RunContext {
  const actor = new FakeActor();
  active = actor;

  const env = { WORKFLOW_TIME_SCALE: '1', SUBSCRIBER_ACTOR: {} } as unknown as Env;
  return new RunContext(env, null, runParams(spec, { mode: 'test', ...overrides }), null);
}

export function fakeSelectDb(rows: unknown[]) {
  const limit = async () => rows;
  const where = () => ({ limit });
  const from = () => ({ where });

  return { select: () => ({ from }) };
}
