import { sendRunCancelPush, specHasLocalDelivery } from '@buzzkit/api/api/messages/local';
import { type RunParams, toWaitPayload } from '@buzzkit/api/engine/types';
import { log } from '@buzzkit/api/libs/logger';
import {
  activeTraceId,
  currentTraceparent,
  flushSpans,
  runInvocation,
  type Span,
  trace,
  withTraceparent,
} from '@buzzkit/api/libs/telemetry';
import type { EventsQueueMessage } from '@buzzkit/api/queue/events';
import type { WorkflowExpression } from '@buzzkit/schema/workflows';
import { Agent } from 'agents';
import {
  ACTOR_DEFINITIONS_CHECK_MS,
  ACTOR_FLUSH_CALLBACK,
  ACTOR_FLUSH_RETRY_SECONDS,
  ACTOR_FLUSH_ROWS,
  ACTOR_RETAINED_ROWS,
  ACTOR_RUNS_LIMIT,
  ACTOR_SERVICE,
} from './constants';
import { evaluateExpression, resolvePath } from './evaluate';
import { flushEvents } from './flush';
import { historyOptions } from './history';
import { acceptEvent, acceptEvents, systemEvent } from './ingest';
import { advanceRuns, runEventData, scheduleRun } from './runs';
import { ActorStore } from './store';
import type {
  ActorDefinitions,
  ActorEventInput,
  ActorEventRow,
  ActorFlushOutcome,
  ActorIdentity,
  ActorIngestInput,
  ActorIngestOutcome,
  ActorProjection,
  ActorRunFinish,
  ActorRunRow,
  ActorScheduledRunInput,
  ActorScheduledRunOutcome,
  ActorStepRecord,
} from './types';

export class SubscriberActor extends Agent<Env> {
  private readonly store = new ActorStore((strings, ...values) => this.sql(strings, ...values));

  async onStart(): Promise<void> {
    this.store.migrate();

    if (this.store.readIdentity() && this.store.listUnflushed(1).length > 0) {
      await this.scheduleFlush(1);
    }
  }

  async ingest(input: ActorIngestInput): Promise<ActorIngestOutcome[]> {
    return await this.invoke(
      'actor.ingest',
      input.traceparent,
      this.spanAttributes(input, { 'events.count': input.events.length }),
      async (t) => {
        this.store.writeIdentity(input);
        const outcomes = acceptEvents(this.store, input.events);

        t.set('events.accepted', outcomes.filter((outcome) => outcome.status === 'accepted').length);
        t.set('events.duplicates', outcomes.filter((outcome) => outcome.status === 'duplicate').length);

        const accepted = outcomes.flatMap((outcome, index) =>
          outcome.status === 'accepted' ? [{ event: input.events[index]!, sequence: outcome.sequence }] : []
        );

        if (accepted.length > 0) {
          const definitions = await this.definitions(input.tenantId);
          const runs = await advanceRuns(this.store, input, definitions, accepted, {
            createRun: (run, definition, trigger, sequence) =>
              this.startRun(input, run, definition.versionId, definition.spec, trigger, sequence),
            terminateRun: (runId) => this.terminateRun(runId),
            deliverWait: async (wait, event) => {
              const instance = await this.env.ENGINE.get(wait.run_id);
              await instance.sendEvent({ type: `evt:${wait.step}`, payload: toWaitPayload(event) });
            },
            cancelLocal: async (run) => {
              const spec = definitions?.workflows.find(
                (definition) => definition.id === run.workflow_id
              )?.spec;
              if (spec && !specHasLocalDelivery(spec)) return;
              this.ctx.waitUntil(sendRunCancelPush(input.tenantId, input.subscriberId, run.run_id));
            },
          });
          t.set('runs.started', runs.started.length);
          t.set('runs.canceled', runs.canceled.length);
          t.set('waits.delivered', runs.delivered.length);
        }

        this.ctx.waitUntil(this.flush());
        return outcomes;
      }
    );
  }

  async startScheduledRun(input: ActorScheduledRunInput): Promise<ActorScheduledRunOutcome> {
    return await this.invoke('actor.schedule', input.traceparent, this.spanAttributes(input), async (t) => {
      this.store.writeIdentity(input);
      const outcome = await scheduleRun(this.store, input, input.definition, input.fire, {
        createRun: (run, definition, trigger, sequence) =>
          this.startRun(input, run, definition.versionId, definition.spec, trigger, sequence),
      });
      t.set('run.outcome', outcome);
      if (outcome === 'started') this.ctx.waitUntil(this.flush());
      return outcome;
    });
  }

  async flush(): Promise<ActorFlushOutcome> {
    const identity = this.store.readIdentity();
    if (!identity) return { flushed: 0, batches: 0, retryScheduled: false, pruned: 0 };

    return await this.invoke('actor.flush', undefined, this.spanAttributes(identity), async (t) => {
      const outcome = await flushEvents(
        this.store,
        {
          enqueue: (rows) => this.enqueue(identity, rows),
          scheduleRetry: () => this.scheduleFlush(ACTOR_FLUSH_RETRY_SECONDS),
        },
        { batchRows: ACTOR_FLUSH_ROWS, retainedRows: ACTOR_RETAINED_ROWS }
      );

      t.set('events.pruned', outcome.pruned);
      t.set('events.flushed', outcome.flushed);
      t.set('flush.batches', outcome.batches);
      t.set('flush.retry_scheduled', outcome.retryScheduled);
      return outcome;
    });
  }

  listRecent(limit = 50, beforeSequence?: number): ActorEventRow[] {
    return this.store.listRecent(limit, beforeSequence);
  }

  listRuns(limit = ACTOR_RUNS_LIMIT): ActorRunRow[] {
    return this.store.listRuns(limit);
  }

  listLiveRuns(): ActorRunRow[] {
    return this.store.listLiveRuns();
  }

  findRun(runId: string): ActorRunRow | null {
    return this.store.findRun(runId);
  }

  async recordStep(runId: string, record: ActorStepRecord): Promise<void> {
    const run = this.store.findRun(runId);
    if (!run || run.status === 'canceled') return;
    const now = new Date().toISOString();
    this.store.updateRun(
      runId,
      record.status === 'completed' || record.status === 'skipped' ? 'running' : record.status,
      record.step,
      record.summary,
      now
    );
    const messageId = record.detail?.messageId;
    acceptEvent(
      this.store,
      systemEvent(
        '$run.step',
        {
          ...runEventData(run),
          step: record.step,
          status: record.status,
          summary: record.summary,
          ...(record.detail ?? {}),
        },
        { runId, step: record.step, messageId: typeof messageId === 'string' ? messageId : null }
      )
    );
    this.ctx.waitUntil(this.flush());
  }

  quietSince(after: string | null, unless: string[]): string | null {
    const started = after === null ? new Date().toISOString() : this.store.lastEventAt(after);
    if (started === null) return null;
    const reset = unless
      .map((event) => this.store.lastEventAt(event))
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1);
    return reset !== undefined && reset >= started ? null : started;
  }

  evaluate(
    runId: string,
    expression: WorkflowExpression,
    scope: Record<string, unknown>,
    timezone: string,
    iterationStartedAt: string | null = null
  ): boolean {
    const run = this.store.findRun(runId);
    return evaluateExpression(
      expression,
      (ref) => resolvePath(scope, ref),
      historyOptions(this.store, run, timezone, new Date(), iterationStartedAt)
    );
  }

  registerWait(runId: string, step: string, event: string, condition: unknown, expiresAt: string): void {
    this.store.insertWait({
      run_id: runId,
      step,
      event,
      condition: condition === undefined || condition === null ? null : JSON.stringify(condition),
      expires_at: expiresAt,
    });
  }

  deregisterWait(runId: string, step: string): void {
    this.store.deleteWait(runId, step);
  }

  async finishRun(runId: string, finish: ActorRunFinish): Promise<void> {
    const run = this.store.findRun(runId);
    if (!run || run.status === 'canceled') return;
    const now = new Date().toISOString();
    const step = finish.step ?? run.step;
    this.store.updateRun(runId, finish.status, step, finish.error ?? null, now);
    this.store.deleteWaitsOfRun(runId);
    acceptEvent(
      this.store,
      systemEvent(
        finish.status === 'completed' ? '$run.completed' : '$run.failed',
        {
          ...runEventData(run),
          ...(finish.status === 'failed' && step ? { step } : {}),
          ...(finish.error ? { error: finish.error } : {}),
        },
        { runId, step }
      )
    );
    this.ctx.waitUntil(this.flush());
  }

  private async definitions(tenantId: number): Promise<ActorDefinitions | null> {
    const now = Date.now();
    const cached = this.store.readDefinitions();
    const checkEvery = ACTOR_DEFINITIONS_CHECK_MS * (Number(this.env.WORKFLOW_TIME_SCALE ?? '1') || 1);
    if (cached && now - this.store.readDefinitionsCheckedAt() < checkEvery) return cached;
    const version = await this.env.ENGINE_DEFS.get(`defs-version:${tenantId}`);
    this.store.writeDefinitionsCheckedAt(now);
    if (version === null) return cached;
    if (cached && Number(version) === cached.version) return cached;
    const fresh = await this.env.ENGINE_DEFS.get<ActorDefinitions>(`defs:${tenantId}`, 'json');
    if (!fresh) return cached;
    this.store.writeDefinitions(fresh);
    return fresh;
  }

  private async startRun(
    identity: ActorIdentity,
    run: ActorRunRow,
    versionId: string,
    spec: RunParams['spec'],
    trigger: ActorEventInput,
    sequence: number
  ): Promise<void> {
    const params: RunParams = {
      runId: run.run_id,
      tenantId: identity.tenantId,
      subscriberId: identity.subscriberId,
      externalId: identity.externalId,
      workflowId: run.workflow_id,
      workflowSlug: run.workflow_slug,
      versionId,
      spec,
      trigger: {
        name: trigger.name,
        data: trigger.data,
        source: trigger.source,
        timestamp: trigger.timestamp,
        sequence,
      },
      attributes: this.store.readAttributes(),
      traceparent: currentTraceparent(),
    };
    try {
      await this.env.ENGINE.createBatch([{ id: run.run_id, params }]);
    } catch (error) {
      log.error('[Actor] Could not start a run', {
        runId: run.run_id,
        error: error instanceof Error ? error.message : String(error),
      });
      const now = new Date().toISOString();
      this.store.updateRun(run.run_id, 'failed', null, 'engine_unavailable', now);
      acceptEvent(
        this.store,
        systemEvent(
          '$run.failed',
          { ...runEventData(run), error: 'engine_unavailable' },
          { runId: run.run_id, step: null }
        )
      );
    }
  }

  private async terminateRun(runId: string): Promise<void> {
    try {
      const instance = await this.env.ENGINE.get(runId);
      await instance.terminate();
    } catch (error) {
      log.warn('[Actor] Could not terminate a run', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  listProjections(): ActorProjection[] {
    return this.store.listProjections();
  }

  private async enqueue(identity: ActorIdentity, rows: ActorEventRow[]): Promise<boolean> {
    try {
      const message = { ...identity, rows } satisfies EventsQueueMessage;
      await Promise.all([
        this.env.EVENTS.send(message),
        this.env.WEBHOOKS.send({ kind: 'stream', ...message }),
      ]);
      return true;
    } catch (error) {
      log.warn('[Actor] Queue refused a flush batch, retrying later', {
        tenantId: identity.tenantId,
        subscriberId: identity.subscriberId,
        rows: rows.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async scheduleFlush(delaySeconds: number): Promise<void> {
    await this.schedule(delaySeconds, ACTOR_FLUSH_CALLBACK, undefined, { idempotent: true });
  }

  private spanAttributes(identity: ActorIdentity, extra: Record<string, number> = {}) {
    return {
      'tenant.id': identity.tenantId,
      'subscriber.id': identity.subscriberId,
      'actor.name': this.name,
      ...extra,
    };
  }

  private invoke<T>(
    name: string,
    traceparent: string | undefined,
    attributes: Record<string, string | number>,
    fn: (t: Span) => Promise<T>
  ): Promise<T> {
    return runInvocation(ACTOR_SERVICE, this.env, this.ctx, () =>
      withTraceparent(traceparent, async () => {
        let traceId: string | undefined;
        try {
          return await trace(name, attributes, (t) => {
            traceId = activeTraceId();
            return fn(t);
          });
        } finally {
          if (traceId) this.ctx.waitUntil(flushSpans(traceId));
        }
      })
    );
  }
}
