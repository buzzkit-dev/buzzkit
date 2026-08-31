import {
  type CancelRule,
  SCHEDULE_TRIGGER_NAME,
  type Trigger,
  type TriggerSource,
  type WorkflowExpression,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import { type EvaluateOptions, evaluateExpression, resolvePath } from './evaluate';
import { historyOptions, subscriberTimezone } from './history';
import { acceptEvent, systemEvent } from './ingest';
import type { ActorStore } from './store';
import type {
  ActorDefinition,
  ActorDefinitions,
  ActorEventInput,
  ActorIdentity,
  ActorRunRow,
  ActorScheduledRunOutcome,
  ActorScheduleFire,
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
  cancelLocal?: (run: ActorRunRow) => Promise<void>;
};

export type RunOutcome = { started: string[]; canceled: string[]; delivered: string[] };

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

function newRun(definition: ActorDefinition, runId: string, sequence: number, now: string): ActorRunRow {
  return {
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
}

type EventContext = {
  scope: Record<string, unknown>;
  attributes: Record<string, unknown>;
  options: (spec: WorkflowSpec, run: ActorRunRow | null) => EvaluateOptions;
};

function eventContext(store: ActorStore, identity: ActorIdentity, event: ActorEventInput): EventContext {
  const attributes = store.readAttributes();
  const now = new Date(event.receivedAt);
  return {
    scope: {
      trigger: { name: event.name, data: event.data, source: event.source },
      event: { name: event.name, data: event.data, source: event.source },
      subscriber: { externalId: identity.externalId, attributes },
    },
    attributes,
    options: (spec, run) =>
      historyOptions(store, run, subscriberTimezone(attributes, spec.defaultTimezone), now),
  };
}

function passes(
  expression: WorkflowExpression | undefined,
  context: EventContext,
  spec: WorkflowSpec,
  run: ActorRunRow | null
): boolean {
  if (!expression) return true;
  try {
    return evaluateExpression(
      expression,
      (ref) => resolvePath(context.scope, ref),
      context.options(spec, run)
    );
  } catch {
    return false;
  }
}

function triggerMatches(spec: WorkflowSpec, event: ActorEventInput, context: EventContext): boolean {
  const trigger: Trigger = spec.trigger;
  if (!('event' in trigger) || trigger.event !== event.name) return false;
  if (trigger.sources && !trigger.sources.includes(event.source as TriggerSource)) return false;
  return passes(trigger.where, context, spec, null);
}

function cancelMatches(
  rules: CancelRule[] | undefined,
  event: ActorEventInput,
  context: EventContext,
  spec: WorkflowSpec,
  run: ActorRunRow
): boolean {
  return (rules ?? []).some((rule) => rule.event === event.name && passes(rule.where, context, spec, run));
}

export async function advanceRuns(
  store: ActorStore,
  identity: ActorIdentity,
  definitions: ActorDefinitions | null,
  events: Array<{ event: ActorEventInput; sequence: number }>,
  ports: RunPorts
): Promise<RunOutcome> {
  const outcome: RunOutcome = { started: [], canceled: [], delivered: [] };
  const workflows = definitions?.workflows ?? [];
  const known = new Set(workflows.map((definition) => definition.id));
  const specOf = (workflowId: string) => workflows.find((definition) => definition.id === workflowId)?.spec;

  for (const live of store.listLiveRuns()) {
    if (known.has(live.workflow_id)) continue;
    await cancelRun(store, live, 'workflow_deleted', ports, outcome);
  }

  for (const { event, sequence } of events) {
    if (event.name.startsWith('$run.')) continue;
    const context = eventContext(store, identity, event);

    for (const wait of store.listWaitsFor(event.name, event.receivedAt)) {
      const condition = wait.condition ? (JSON.parse(wait.condition) as WorkflowExpression) : undefined;
      const run = store.findRun(wait.run_id);
      const spec = run ? specOf(run.workflow_id) : undefined;
      if (!run || !spec || !passes(condition, context, spec, run)) continue;
      store.deleteWait(wait.run_id, wait.step);
      await ports.deliverWait(wait, event);
      outcome.delivered.push(wait.run_id);
    }

    for (const definition of workflows) {
      if (definition.status !== 'active') continue;
      const spec = definition.spec;
      const live = store.listLiveRuns(definition.id);

      for (const run of live) {
        if (!cancelMatches(spec.cancelOn, event, context, spec, run)) continue;
        await cancelRun(store, run, `cancelOn:${event.name}`, ports, outcome);
      }

      if (!triggerMatches(spec, event, context)) continue;
      if (spec.concurrency === 'one-per-subscriber' && store.listLiveRuns(definition.id).length > 0) continue;

      const runId = runIdFor(identity, definition.id, sequence);
      if (store.findRun(runId)) continue;
      const run = newRun(definition, runId, sequence, new Date().toISOString());
      store.insertRun(run);
      acceptEvent(
        store,
        systemEvent(
          '$run.started',
          { ...runEventData(run), trigger: { name: event.name, id: event.id } },
          {
            runId,
            step: null,
          }
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
  store.updateRun(run.run_id, 'canceled', run.step, reason, now);
  store.deleteWaitsOfRun(run.run_id);
  acceptEvent(
    store,
    systemEvent('$run.canceled', { ...runEventData(run), reason }, { runId: run.run_id, step: run.step })
  );
  await ports.terminateRun(run.run_id);
  if (ports.cancelLocal) await ports.cancelLocal(run);
  outcome.canceled.push(run.run_id);
}

export async function scheduleRun(
  store: ActorStore,
  identity: ActorIdentity,
  definition: ActorDefinition,
  fire: ActorScheduleFire,
  ports: Pick<RunPorts, 'createRun'>
): Promise<ActorScheduledRunOutcome> {
  const spec = definition.spec;
  if (!('schedule' in spec.trigger) || definition.status !== 'active') return 'skipped';
  const runId = `${identity.tenantId}-${definition.id}-${identity.subscriberId}-${Date.parse(fire.at)}`;
  if (store.findRun(runId)) return 'duplicate';

  const firedAt = new Date(fire.at);
  const trigger = systemEvent(
    SCHEDULE_TRIGGER_NAME,
    { firedAt: fire.at, zone: fire.zone },
    { runId, step: null, now: firedAt }
  );
  const context = eventContext(store, identity, trigger);
  if (!passes(spec.trigger.where, context, spec, null)) return 'skipped';
  if (spec.concurrency === 'one-per-subscriber' && store.listLiveRuns(definition.id).length > 0) {
    return 'skipped';
  }

  const sequence = store.latestSequence();
  const run = newRun(definition, runId, sequence, new Date().toISOString());
  store.insertRun(run);
  acceptEvent(
    store,
    systemEvent(
      '$run.started',
      { ...runEventData(run), trigger: { name: SCHEDULE_TRIGGER_NAME, firedAt: fire.at, zone: fire.zone } },
      { runId, step: null }
    )
  );
  await ports.createRun(run, definition, trigger, sequence);
  return 'started';
}
