import { type Expression, evaluateExpression, resolvePath } from 'buzzkit/expressions';
import type { CancelRule, Trigger } from 'buzzkit/workflows';
import { acceptEvent, systemEvent } from './ingest';
import type { ActorStore } from './store';
import type {
  ActorDefinition,
  ActorDefinitions,
  ActorEventInput,
  ActorIdentity,
  ActorRunRow,
  ActorWaitRow,
} from './types';

export type RunPorts = {
  createRun: (
    run: ActorRunRow,
    definition: ActorDefinition,
    trigger: ActorEventInput,
    sequence: number
  ) => Promise<void>;
  terminateRun: (runId: string) => Promise<void>;
  deliverWait: (wait: ActorWaitRow, event: ActorEventInput) => Promise<void>;
};

export type RunOutcome = { started: string[]; cancelled: string[]; delivered: string[] };

export function runEventData(run: ActorRunRow) {
  return {
    runId: run.run_id,
    workflow: run.workflow_slug,
    workflowId: run.workflow_id,
    versionId: run.version_id,
    startedAt: run.started_at,
  };
}

export function runIdFor(identity: ActorIdentity, workflowId: string, sequence: number): string {
  return `${identity.tenantId}-${workflowId}-${identity.subscriberId}-${sequence}`;
}

function triggerContext(store: ActorStore, identity: ActorIdentity, event: ActorEventInput) {
  return {
    trigger: { name: event.name, data: event.data, source: event.source },
    event: { name: event.name, data: event.data, source: event.source },
    subscriber: { externalId: identity.externalId, attributes: store.readAttributes() },
  };
}

function passes(expression: Expression | undefined, context: unknown): boolean {
  if (!expression) return true;
  try {
    return evaluateExpression(expression, (ref) => resolvePath(context, ref));
  } catch {
    return false;
  }
}

function triggerMatches(trigger: Trigger, event: ActorEventInput, context: unknown): boolean {
  if (trigger.event !== event.name) return false;
  if (
    trigger.sources &&
    !trigger.sources.includes(event.source as Trigger['sources'] extends (infer S)[] | undefined ? S : never)
  )
    return false;
  return passes(trigger.where, context);
}

function cancelMatches(rules: CancelRule[] | undefined, event: ActorEventInput, context: unknown): boolean {
  return (rules ?? []).some((rule) => rule.event === event.name && passes(rule.where, context));
}

export async function advanceRuns(
  store: ActorStore,
  identity: ActorIdentity,
  definitions: ActorDefinitions | null,
  events: Array<{ event: ActorEventInput; sequence: number }>,
  ports: RunPorts
): Promise<RunOutcome> {
  const outcome: RunOutcome = { started: [], cancelled: [], delivered: [] };
  const workflows = definitions?.workflows ?? [];
  const known = new Set(workflows.map((definition) => definition.id));

  for (const live of store.listLiveRuns()) {
    if (known.has(live.workflow_id)) continue;
    await cancelRun(store, live, 'workflow_deleted', ports, outcome);
  }

  for (const { event, sequence } of events) {
    if (event.name.startsWith('$run.')) continue;
    const context = triggerContext(store, identity, event);

    for (const wait of store.listWaitsFor(event.name, event.receivedAt)) {
      const condition = wait.condition ? (JSON.parse(wait.condition) as Expression) : undefined;
      if (!passes(condition, context)) continue;
      store.deleteWait(wait.run_id, wait.step);
      await ports.deliverWait(wait, event);
      outcome.delivered.push(wait.run_id);
    }

    for (const definition of workflows) {
      if (definition.status !== 'active') continue;
      const spec = definition.spec;
      const live = store.listLiveRuns(definition.id);

      if (cancelMatches(spec.cancelOn, event, context)) {
        for (const run of live) await cancelRun(store, run, `cancelOn:${event.name}`, ports, outcome);
      }

      if (!triggerMatches(spec.trigger, event, context)) continue;
      if (spec.concurrency === 'one-per-subscriber' && store.listLiveRuns(definition.id).length > 0) continue;

      const runId = runIdFor(identity, definition.id, sequence);
      if (store.findRun(runId)) continue;
      const now = new Date().toISOString();
      const run: ActorRunRow = {
        run_id: runId,
        workflow_id: definition.id,
        workflow_slug: definition.slug,
        version_id: definition.versionId,
        status: 'running',
        step: null,
        detail: null,
        trigger_sequence: sequence,
        started_at: now,
        updated_at: now,
      };
      store.insertRun(run);
      acceptEvent(
        store,
        systemEvent(
          '$run.started',
          { ...runEventData(run), trigger: { name: event.name, id: event.id } },
          runId,
          null
        )
      );
      await ports.createRun(run, definition, event, sequence);
      outcome.started.push(runId);
    }
  }
  return outcome;
}

async function cancelRun(
  store: ActorStore,
  run: ActorRunRow,
  reason: string,
  ports: RunPorts,
  outcome: RunOutcome
): Promise<void> {
  const now = new Date().toISOString();
  store.updateRun(run.run_id, 'cancelled', run.step, reason, now);
  store.deleteWaitsOfRun(run.run_id);
  acceptEvent(store, systemEvent('$run.cancelled', { ...runEventData(run), reason }, run.run_id, run.step));
  await ports.terminateRun(run.run_id);
  outcome.cancelled.push(run.run_id);
}
