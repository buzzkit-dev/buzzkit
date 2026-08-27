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
import { ActorStore } from './store';
import type {
  ActorEventInput,
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
        const outcomes = input.events.map((event) => this.accept(event));

        t.set('events.accepted', outcomes.filter((outcome) => outcome.status === 'accepted').length);
        t.set('events.duplicates', outcomes.filter((outcome) => outcome.status === 'duplicate').length);

        this.ctx.waitUntil(this.flush());
        return outcomes;
      }
    );
  }

  async flush(): Promise<ActorFlushOutcome> {
    const identity = this.store.readIdentity();
    if (!identity) return { flushed: 0, batches: 0, retryScheduled: false };

    return await this.invoke('actor.flush', undefined, this.spanAttributes(identity), async (t) => {
      const outcome: ActorFlushOutcome = { flushed: 0, batches: 0, retryScheduled: false };

      let batch = this.store.listUnflushed(ACTOR_FLUSH_ROWS);
      while (batch.length > 0) {
        if (!(await this.enqueue(identity, batch))) {
          await this.scheduleFlush(ACTOR_FLUSH_RETRY_SECONDS);
          outcome.retryScheduled = true;
          break;
        }
        this.store.advanceFlushedSequence(batch[batch.length - 1]!.sequence);
        outcome.flushed += batch.length;
        outcome.batches += 1;
        batch = batch.length < ACTOR_FLUSH_ROWS ? [] : this.store.listUnflushed(ACTOR_FLUSH_ROWS);
      }

      if (!outcome.retryScheduled) {
        t.set('events.pruned', this.store.prune(ACTOR_RETAINED_ROWS));
      }
      t.set('events.flushed', outcome.flushed);
      t.set('flush.batches', outcome.batches);
      t.set('flush.retry_scheduled', outcome.retryScheduled);
      return outcome;
    });
  }

  listRecent(limit = 50): ActorEventRow[] {
    return this.store.listRecent(limit);
  }

  listProjections(): ActorProjection[] {
    return this.store.listProjections();
  }

  private accept(event: ActorEventInput): ActorIngestOutcome {
    const existing = event.idempotencyKey ? this.store.findByIdempotencyKey(event.idempotencyKey) : null;
    if (existing) {
      return { id: existing.id, sequence: existing.sequence, status: 'duplicate' };
    }

    const sequence = this.store.insertEvent(event);
    this.store.recordProjection(event.name, sequence, event.timestamp);
    return { id: event.id, sequence, status: 'accepted' };
  }

  private async enqueue(identity: ActorIdentity, rows: ActorEventRow[]): Promise<boolean> {
    try {
      await this.env.EVENTS.send({ ...identity, rows } satisfies EventsQueueMessage);
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
