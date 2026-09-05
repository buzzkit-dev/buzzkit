import type { EventMatcher } from '@buzzkit/schema/workflows';
import { evaluateExpression, resolvePath } from './evaluate';
import { historyOptions } from './history';
import type { ActorStore } from './store';
import type { ActorEventRow, ActorIdentity, ActorOccurrence } from './types';

function occurrenceMatches(
  store: ActorStore,
  identity: ActorIdentity | null,
  row: ActorEventRow,
  matcher: EventMatcher,
  timezone: string
): boolean {
  if (matcher.where === undefined) return true;
  const scope = {
    event: { name: row.name, data: JSON.parse(row.data) as Record<string, unknown>, source: row.source },
    subscriber: { externalId: identity?.externalId ?? null, attributes: store.readAttributes() },
  };

  return evaluateExpression(
    matcher.where,
    (ref) => resolvePath(scope, ref),
    historyOptions(store, null, timezone, new Date())
  );
}

function resetSince(
  store: ActorStore,
  identity: ActorIdentity | null,
  matcher: EventMatcher,
  started: string,
  timezone: string
): boolean {
  if (matcher.where === undefined) {
    const at = store.lastEventAt(matcher.event);
    return at !== null && at >= started;
  }

  return store
    .listNamedSince(matcher.event, started)
    .some((row) => occurrenceMatches(store, identity, row, matcher, timezone));
}

export function selectQuietAnchor(
  store: ActorStore,
  identity: ActorIdentity | null,
  after: string,
  unless: EventMatcher[],
  timezone: string
): ActorOccurrence | null {
  const started = store.lastEventAt(after);
  if (started === null) return null;
  if (unless.some((matcher) => resetSince(store, identity, matcher, started, timezone))) return null;

  const row = store.lastEvent(after);
  if (row) return { name: row.name, dataJson: row.data, timestamp: row.timestamp, id: row.id };
  return { name: after, dataJson: '{}', timestamp: started, id: `${after}@${started}` };
}
