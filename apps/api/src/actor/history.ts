import { localMidnight } from '@buzzkit/api/libs/timezone';
import { DEFAULT_TIMEZONE, isTimezone } from '@buzzkit/schema/workflows';
import type { EvaluateOptions, HistoryResolver } from './evaluate';
import type { ActorStore } from './store';
import type { ActorRunRow } from './types';

const OPENED_EVENT = '$notification.opened';

const DELIVERED_EVENT = '$notification.delivered';

export function subscriberTimezone(attributes: Record<string, unknown>, fallback?: string): string {
  const own = attributes.$timezone;
  if (isTimezone(own)) return own;
  return fallback && isTimezone(fallback) ? fallback : DEFAULT_TIMEZONE;
}

export function historyResolver(store: ActorStore, runId: string | null): HistoryResolver {
  return {
    count: (event, window) => store.countEvents(event, window.from),
    opened: (step) => runId !== null && store.hasMessageEvent(OPENED_EVENT, runId, step),
    delivered: (step) => runId !== null && store.hasMessageEvent(DELIVERED_EVENT, runId, step),
  };
}

export function historyOptions(
  store: ActorStore,
  run: Pick<ActorRunRow, 'run_id' | 'started_at'> | null,
  timezone: string,
  now = new Date(),
  iterationStartedAt: string | null = null
): EvaluateOptions {
  const trigger = run?.started_at ?? now.toISOString();

  return {
    history: historyResolver(store, run?.run_id ?? null),
    now,
    since: {
      trigger,
      localMidnight: localMidnight(now, timezone).toISOString(),
      iteration: iterationStartedAt ?? trigger,
    },
  };
}
