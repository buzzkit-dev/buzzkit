import type { IconName } from '@buzzkit/ui/components/icon';
import {
  type Anchor,
  type Duration,
  describeDuration,
  type Step,
  type StepKind,
  type WorkflowSpec,
} from 'buzzkit/workflows';

export type StepRow = {
  key: string;
  name: string | null;
  kind: StepKind;
  icon: IconName;
  summary: string;
  depth: number;
  lane: 'then' | 'else' | null;
};

export type RunEventDescription = { icon: IconName; label: string; detail: string | null };

const STEP_ICONS: Record<StepKind, { icon: IconName }> = {
  wait: { icon: 'IconHourglassFilled' },
  waitUntil: { icon: 'IconCalendarClockFilled' },
  waitFor: { icon: 'IconEarFilled' },
  branch: { icon: 'IconSplitFilled' },
  send: { icon: 'IconPaperPlaneTopRightFilled' },
  exit: { icon: 'IconArrowBoxRight' },
};

const STEP_STATUS_ICONS: Record<string, { icon: IconName }> = {
  completed: { icon: 'IconCircleCheckFilled' },
  waiting: { icon: 'IconEarFilled' },
  sleeping: { icon: 'IconHourglassFilled' },
  running: { icon: 'IconCircleDashedFilled' },
};

export function stepIcon(kind: StepKind): IconName {
  return STEP_ICONS[kind].icon;
}

const OPERATORS: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'in',
  contains: 'contains',
  exists: 'exists',
};

function value(input: unknown): string {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
}

export function describeCondition(node: unknown): string {
  if (!node || typeof node !== 'object') return 'conditions';
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.all)) return record.all.map(describeCondition).join(' and ');
  if (Array.isArray(record.any)) return record.any.map(describeCondition).join(' or ');
  if (record.not) return `not ${describeCondition(record.not)}`;
  if (typeof record.ref === 'string') {
    const comparator = Object.entries(record).find(([key]) => key !== 'ref');
    if (!comparator) return record.ref;
    const [operator, operand] = comparator;
    return `${record.ref} ${OPERATORS[operator] ?? operator} ${value(operand)}`;
  }
  return 'conditions';
}

export function describeTrigger(spec: WorkflowSpec): string {
  const sources = spec.trigger.sources?.length ? ` from ${spec.trigger.sources.join(', ')}` : '';
  const where = spec.trigger.where ? ` where ${describeCondition(spec.trigger.where)}` : '';
  return `on ${spec.trigger.event}${sources}${where}`;
}

function describeAnchor(anchor: Anchor): string {
  const base = anchor.after === 'trigger' ? 'the trigger' : anchor.after.replace('steps.', 'step ');
  const plus = anchor.plus ? `${describeDuration(anchor.plus)} after ${base}` : base;
  const at = anchor.at ? ` at ${anchor.at}` : '';
  const timezone = anchor.timezone ? ` ${anchor.timezone.replace(/_/g, ' ')}` : '';
  return `${plus}${at}${timezone}`;
}

function describeUntil(until: Anchor | Duration): string {
  return typeof until === 'string'
    ? `for up to ${describeDuration(until)}`
    : `until ${describeAnchor(until)}`;
}

export function stepKind(step: Step): StepKind {
  if ('wait' in step) return 'wait';
  if ('waitUntil' in step) return 'waitUntil';
  if ('waitFor' in step) return 'waitFor';
  if ('branch' in step) return 'branch';
  if ('send' in step) return 'send';
  return 'exit';
}

export function describeStep(step: Step): string {
  if ('wait' in step) return `Wait ${describeDuration(step.wait)}`;
  if ('waitUntil' in step) return `Wait until ${describeAnchor(step.waitUntil)}`;
  if ('waitFor' in step) return `Wait for ${step.waitFor.event} ${describeUntil(step.waitFor.until)}`;
  if ('branch' in step) return `If ${describeCondition(step.branch.if)}`;
  if ('send' in step) {
    const title = step.send.title ?? step.send.body ?? 'a message';
    return `Send “${title}”${step.send.topic ? ` to ${step.send.topic}` : ''}`;
  }
  return 'Exit';
}

export function flattenSteps(steps: Step[], depth = 0, lane: StepRow['lane'] = null, prefix = ''): StepRow[] {
  const rows: StepRow[] = [];
  steps.forEach((step, index) => {
    const kind = stepKind(step);
    const name = 'name' in step ? step.name : null;
    const key = `${prefix}${index}`;
    rows.push({
      key,
      name,
      kind,
      icon: stepIcon(kind),
      summary: describeStep(step),
      depth,
      lane: index === 0 ? lane : null,
    });
    if ('branch' in step) {
      rows.push(...flattenSteps(step.branch.then, depth + 1, 'then', `${key}.then.`));
      if (step.branch.else) rows.push(...flattenSteps(step.branch.else, depth + 1, 'else', `${key}.else.`));
    }
  });
  return rows;
}

export function describeRunEvent(event: {
  name: string;
  step: string | null;
  data: Record<string, unknown>;
}): RunEventDescription {
  const data = event.data;
  const summary = typeof data.summary === 'string' ? data.summary : null;
  switch (event.name) {
    case '$run.started': {
      const trigger = data.trigger as { name?: string } | undefined;
      return {
        icon: 'IconPlayFilled',
        label: 'Started',
        detail: trigger?.name ? `on ${trigger.name}` : null,
      };
    }
    case '$run.step': {
      const status = typeof data.status === 'string' ? data.status : 'running';
      const { icon } = STEP_STATUS_ICONS[status] ?? STEP_STATUS_ICONS.running!;
      return { icon, label: event.step ?? 'Step', detail: summary };
    }
    case '$run.completed':
      return { icon: 'IconCircleCheckFilled', label: 'Completed', detail: null };
    case '$run.cancelled':
      return {
        icon: 'IconCircleBanSignFilled',
        label: 'Cancelled',
        detail: typeof data.reason === 'string' ? data.reason : null,
      };
    case '$run.failed':
      return {
        icon: 'IconCircleXFilled',
        label: 'Failed',
        detail: typeof data.error === 'string' ? data.error : null,
      };
    default:
      return { icon: 'IconZapFilled', label: event.name, detail: null };
  }
}

function stepsByName(steps: Step[], into = new Map<string, string>()): Map<string, string> {
  for (const step of steps) {
    if ('name' in step) into.set(step.name, JSON.stringify(step));
    if ('branch' in step) {
      stepsByName(step.branch.then, into);
      if (step.branch.else) stepsByName(step.branch.else, into);
    }
  }
  return into;
}

function names(list: string[]): string {
  return list.join(', ');
}

export function describeVersionChanges(spec: WorkflowSpec, previous: WorkflowSpec | null): string[] {
  if (!previous) return ['First version'];
  const changes: string[] = [];
  if (JSON.stringify(spec.trigger) !== JSON.stringify(previous.trigger)) changes.push('Trigger changed');
  if (JSON.stringify(spec.cancelOn ?? []) !== JSON.stringify(previous.cancelOn ?? []))
    changes.push('Cancel rules changed');
  if ((spec.concurrency ?? 'per-event') !== (previous.concurrency ?? 'per-event'))
    changes.push('Concurrency changed');
  const before = stepsByName(previous.steps);
  const after = stepsByName(spec.steps);
  const added = [...after.keys()].filter((name) => !before.has(name));
  const removed = [...before.keys()].filter((name) => !after.has(name));
  const changed = [...after.keys()].filter(
    (name) => before.has(name) && before.get(name) !== after.get(name)
  );
  if (added.length > 0) changes.push(`Added ${names(added)}`);
  if (removed.length > 0) changes.push(`Removed ${names(removed)}`);
  if (changed.length > 0) changes.push(`Changed ${names(changed)}`);
  if (changes.length === 0 && JSON.stringify(spec.steps) !== JSON.stringify(previous.steps))
    changes.push('Steps reordered');
  return changes.length > 0 ? changes : ['No changes'];
}
