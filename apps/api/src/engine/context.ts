import type { WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { evaluateExpression, type HistoryResolver, resolvePath } from '@buzzkit/api/actor/evaluate';
import { subscriberTimezone } from '@buzzkit/api/actor/history';
import type { SubscriberActor } from '@buzzkit/api/actor/subscriber';
import { ApiError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { localMidnight } from '@buzzkit/api/libs/timezone';
import { runInvocation, withTraceparent } from '@buzzkit/observability';
import {
  type Duration,
  durationSeconds,
  type Moment,
  type WorkflowExpression,
} from '@buzzkit/schema/workflows';
import { getAgentByName } from 'agents';
import { ENGINE_SERVICE, MIN_WAIT_FOR_MS } from './constants';
import { type ResolvedMoment, resolveMoment } from './moments';
import type {
  Assumption,
  RunMode,
  RunParams,
  RunState,
  StepOutcome,
  StepStatus,
  TraceEntry,
  WaitPayload,
} from './types';

const NO_HISTORY: HistoryResolver = { count: () => 0, opened: () => false, delivered: () => false };

function rethrowPermanent(error: unknown): never {
  if (error instanceof ApiError && error.status < 500) throw new NonRetryableError(error.message);
  throw error;
}

export class ExitRun extends Error {
  constructor() {
    super('exit');
    this.name = 'ExitRun';
  }
}

export class RunContext {
  readonly state: RunState = { steps: {}, vars: {} };
  readonly trace: TraceEntry[] = [];
  readonly mode: RunMode;
  private readonly scale: number;
  private clock: number;

  current: string | null = null;

  constructor(
    private readonly env: Env,
    private readonly ctx: ExecutionContext | null,
    readonly params: RunParams,
    private readonly step: WorkflowStep | null
  ) {
    this.scale = Number(env.WORKFLOW_TIME_SCALE ?? '1') || 1;
    this.mode = params.mode ?? 'run';
    this.clock = Date.parse(params.trigger.timestamp) || Date.now();
  }

  now(): number {
    return this.live ? Date.now() : this.clock;
  }

  rendering(): { timezone: string; now: Date } {
    return { timezone: this.timezone(), now: new Date(this.now()) };
  }

  get live(): boolean {
    return this.mode === 'run';
  }

  get hasSubscriber(): boolean {
    return this.params.subscriberId > 0;
  }

  actor() {
    return getAgentByName<Env, SubscriberActor>(
      this.env.SUBSCRIBER_ACTOR,
      `${this.params.tenantId}:${this.params.subscriberId}`
    );
  }

  scope() {
    const { trigger, externalId, attributes } = this.params;
    return {
      trigger: { name: trigger.name, data: trigger.data, source: trigger.source },
      subscriber: { externalId, attributes },
      steps: this.state.steps,
      vars: this.state.vars,
    };
  }

  timezone(): string {
    return subscriberTimezone(this.params.attributes, this.params.spec.defaultTimezone);
  }

  assumption(step: string): Assumption | null {
    return this.params.assume?.[step] ?? null;
  }

  moment(moment: Moment): ResolvedMoment {
    return resolveMoment(moment, this.params.trigger, this.timezone());
  }

  deadline(timeout: Moment | Duration): Promise<number> {
    if (typeof timeout === 'string') return Promise.resolve(this.now() + durationSeconds(timeout) * 1000);
    return this.do(`${this.current}:deadline`, async () => this.moment(timeout).at);
  }

  scaled(ms: number): number {
    return Math.max(0, Math.round(ms * this.scale));
  }

  async evaluate(expression: WorkflowExpression): Promise<boolean> {
    if (this.hasSubscriber) {
      const actor = await this.actor();
      return await actor.evaluate(this.params.runId, expression, this.scope(), this.timezone());
    }
    const scope = this.scope();
    const now = new Date(this.now());
    return evaluateExpression(expression, (ref) => resolvePath(scope, ref), {
      history: NO_HISTORY,
      now,
      since: {
        trigger: this.params.trigger.timestamp,
        localMidnight: localMidnight(now, this.timezone()).toISOString(),
      },
    });
  }

  async sleep(name: string, ms: number): Promise<void> {
    if (!this.live) {
      this.clock += Math.max(0, ms);
      return;
    }
    await this.workflowStep().sleep(name, this.scaled(ms));
  }

  async listen(step: string, label: string, timeoutMs: number): Promise<WaitPayload | null> {
    if (!this.live) {
      const assumed = this.assumption(step);
      if (!assumed?.matched) return null;
      return {
        name: 'assumed',
        dataJson: JSON.stringify(assumed.data ?? {}),
        timestamp: new Date(this.now()).toISOString(),
        id: `evt_assumed_${step}`,
      };
    }
    try {
      const result = await this.workflowStep().waitForEvent<WaitPayload>(label, {
        type: `evt:${step}`,
        timeout: this.scaled(Math.max(MIN_WAIT_FOR_MS, timeoutMs)),
      });
      return result.payload;
    } catch {
      return null;
    }
  }

  async report(name: string, status: StepStatus, summary: string, detail?: Record<string, unknown>) {
    if (!this.live) {
      this.trace.push({
        step: name,
        status,
        summary,
        detail: detail ?? null,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }
    log.info('[Engine] Step', {
      runId: this.params.runId,
      workflow: this.params.workflowSlug,
      step: name,
      status,
      summary,
    });
    await (await this.actor()).recordStep(this.params.runId, { step: name, status, summary, detail });
  }

  do<T extends Rpc.Serializable<T>>(
    name: string,
    fn: () => Promise<T>,
    config?: WorkflowStepConfig
  ): Promise<T> {
    if (!this.live) return fn();
    const step = this.workflowStep();
    const invoke = () =>
      runInvocation(
        ENGINE_SERVICE,
        this.env,
        this.ctx as ExecutionContext,
        () => withTraceparent(this.params.traceparent, () => fn().catch(rethrowPermanent)),
        { traced: false }
      );
    return config ? step.do(name, config, invoke) : step.do(name, invoke);
  }

  record(
    name: string,
    status: StepStatus,
    summary: string,
    detail?: Record<string, unknown>
  ): Promise<StepOutcome> {
    return this.do(`${name}:${status}`, async () => {
      await this.report(name, status, summary, detail);
      return { at: new Date(this.now()).toISOString() };
    });
  }

  private workflowStep(): WorkflowStep {
    if (!this.step) throw new Error('A dry run has no Workflow step');
    return this.step;
  }
}
