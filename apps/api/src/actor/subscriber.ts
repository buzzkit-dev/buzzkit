import { log } from '@buzzkit/api/libs/logger';
import {
  activeTraceId,
  flushSpans,
  runInvocation,
  type Span,
  trace,
  withTraceparent,
} from '@buzzkit/api/libs/telemetry';
import type { EventsQueueMessage } from '@buzzkit/api/queue/events';
import { Agent } from 'agents';
import {
  ACTOR_FLUSH_CALLBACK,
  ACTOR_FLUSH_RETRY_SECONDS,
  ACTOR_FLUSH_ROWS,
  ACTOR_RETAINED_ROWS,
  ACTOR_SERVICE,
} from './constants';
import { flushEvents } from './flush';
import { acceptEvents } from './ingest';
import { ActorStore } from './store';
import type {
  ActorEventRow,
  ActorFlushOutcome,
  ActorIdentity,
  ActorIngestInput,
  ActorIngestOutcome,
  ActorProjection,
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

        this.ctx.waitUntil(this.flush());
        return outcomes;
      }
    );
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
