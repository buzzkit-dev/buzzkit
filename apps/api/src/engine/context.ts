import type { WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { SubscriberActor } from '@buzzkit/api/actor/subscriber';
import { ApiError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { runInvocation, withTraceparent } from '@buzzkit/observability';
import { getAgentByName } from 'agents';
import type { Anchor } from 'buzzkit/workflows';
import { resolveAnchor } from './anchors';
import { ENGINE_SERVICE } from './constants';
import type { RunParams, RunState, StepOutcome, StepStatus } from './types';

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
  readonly state: RunState = { steps: {} };
  current: string | null = null;
  private readonly scale: number;

  constructor(
    private readonly env: Env,
    private readonly ctx: ExecutionContext,
    readonly params: RunParams,
    readonly step: WorkflowStep
  ) {
    this.scale = Number(env.WORKFLOW_TIME_SCALE ?? '1') || 1;
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
    };
  }

  anchor(anchor: Anchor): number {
    return resolveAnchor(anchor, this.params.trigger, this.state.steps);
  }

  scaled(ms: number): number {
    return Math.max(0, Math.round(ms * this.scale));
  }

  async report(name: string, status: StepStatus, summary: string, detail?: Record<string, unknown>) {
    log.info('[Engine] Step', {
      runId: this.params.runId,
      workflow: this.params.workflowSlug,
      step: name,
      status,
      summary,
    });
    await (await this.actor()).recordStep(this.params.runId, { step: name, status, summary, detail });
  }

  do<T extends Rpc.Serializable<T>>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.step.do(name, () =>
      runInvocation(
        ENGINE_SERVICE,
        this.env,
        this.ctx,
        () => withTraceparent(this.params.traceparent, () => fn().catch(rethrowPermanent)),
        { traced: false }
      )
    );
  }

  record(
    name: string,
    status: StepStatus,
    summary: string,
    detail?: Record<string, unknown>
  ): Promise<StepOutcome> {
    return this.do(`${name}:${status}`, async () => {
      await this.report(name, status, summary, detail);
      return { at: new Date().toISOString() };
    });
  }
}
