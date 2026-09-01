import {
  type CronFields,
  describeDuration,
  FALLBACK_CASE,
  type Moment,
  parseCron,
  SCHEDULE_TRIGGER_NAME,
  type Schedule,
  type Step,
  type StepKind,
  SUBSCRIBER_TIMEZONE,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import type { IconName } from '@buzzkit/ui/components/icon';
import type { Duration, Expression } from 'buzzkit/expressions';
import { describeCondition as describeLeaf } from '@/app/components/conditions/describe';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function clock(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

function ordinal(day: number): string {
  const rest = day % 100;
  if (rest >= 11 && rest <= 13) return `${day}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function describeSchedule(schedule: Schedule): string {
  if ('daily' in schedule) return `every day at ${schedule.daily}`;
  let fields: CronFields;
  try {
    fields = parseCron(schedule.cron);
  } catch {
    return schedule.cron;
  }
  const single = fields.hours.length === 1 && fields.minutes.length === 1;
  const time = single ? clock(fields.hours[0] as number, fields.minutes[0] as number) : null;
  const everyMonth = fields.months.length === 12;
  if (fields.anyDay && fields.anyWeekday && everyMonth) {
    if (fields.minutes.length === 60 && fields.hours.length === 24) return 'every minute';
    if (fields.minutes.length === 1 && fields.hours.length === 24) return 'every hour';
    if (time) return `every day at ${time}`;
  }
  if (fields.anyDay && !fields.anyWeekday && everyMonth && time) {
    const weekdays = fields.weekdays;
    if (weekdays.join(',') === '1,2,3,4,5') return `on weekdays at ${time}`;
    if (weekdays.join(',') === '0,6') return `on weekends at ${time}`;
    return `every ${joinNames(weekdays.map((day) => WEEKDAY_NAMES[day] as string))} at ${time}`;
  }
  if (!fields.anyDay && fields.anyWeekday && everyMonth && time) {
    return `on the ${joinNames(fields.days.map(ordinal))} of every month at ${time}`;
  }
  return schedule.cron;
}

export type StepRow = {
  key: string;
  name: string | null;
  kind: StepKind;
  icon: IconName;
  summary: string;
  depth: number;
  lane: string | null;
};

export type RunEventDescription = { icon: IconName; label: string; detail: string | null };

const STEP_ICONS: Record<StepKind, { icon: IconName }> = {
  wait: { icon: 'IconHourglassFilled' },
  waitUntil: { icon: 'IconCalendarClockFilled' },
  waitFor: { icon: 'IconEarFilled' },
  repeat: { icon: 'IconArrowRotateClockwiseFilled' },
  forEach: { icon: 'IconLayersTwoFilled' },
  branch: { icon: 'IconSplitFilled' },
  fetch: { icon: 'IconGlobeFilled' },
  set: { icon: 'IconPencilFilled' },
  send: { icon: 'IconPaperPlaneTopRightFilled' },
  exit: { icon: 'IconArrowBoxRight' },
};

const STEP_STATUS_ICONS: Record<string, { icon: IconName }> = {
  completed: { icon: 'IconCircleCheckFilled' },
  skipped: { icon: 'IconCircleBanSignFilled' },
  waiting: { icon: 'IconEarFilled' },
  sleeping: { icon: 'IconHourglassFilled' },
  running: { icon: 'IconCircleDashedFilled' },
};

const SETTLE_ICON = { icon: 'IconMoonFilled' } satisfies { icon: IconName };

export function stepIcon(kind: StepKind, step?: Step): IconName {
  if (step && 'waitFor' in step && step.waitFor.settleFor) return SETTLE_ICON.icon;
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

function describeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
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
  return describeLeaf(node as Expression);
}

export function describeTrigger(spec: WorkflowSpec): string {
  const { trigger } = spec;
  const where = trigger.where ? ` where ${describeCondition(trigger.where)}` : '';
  if ('schedule' in trigger) {
    const segment = trigger.segment ? ` for ${trigger.segment}` : '';
    return `${describeSchedule(trigger.schedule)}${segment}${where}`;
  }
  const sources = trigger.sources?.length ? ` from ${trigger.sources.join(', ')}` : '';
  return `on ${trigger.event}${sources}${where}`;
}

export function describeMoment(moment: Moment): string {
  const delay = moment.delay ? `${describeDuration(moment.delay)} after the start` : '';
  const zone =
    moment.timezone === SUBSCRIBER_TIMEZONE
      ? " in the subscriber's timezone"
      : moment.timezone
        ? ` ${moment.timezone.replace(/_/g, ' ')}`
        : '';
  const time = moment.time ? `${delay ? ', then ' : ''}${moment.time}${zone}` : '';
  return `${delay}${time}`;
}

export function describeTimeout(timeout: Moment | Duration): string {
  return typeof timeout === 'string'
    ? `for up to ${describeDuration(timeout)}`
    : `until ${describeMoment(timeout)}`;
}

export function stepKind(step: Step): StepKind {
  if ('wait' in step) return 'wait';
  if ('waitUntil' in step) return 'waitUntil';
  if ('waitFor' in step) return 'waitFor';
  if ('repeat' in step) return 'repeat';
  if ('forEach' in step) return 'forEach';
  if ('branch' in step) return 'branch';
  if ('fetch' in step) return 'fetch';
  if ('set' in step) return 'set';
  if ('send' in step) return 'send';
  return 'exit';
}

export function describeStep(step: Step): string {
  if ('wait' in step) return `Wait ${describeDuration(step.wait)}`;
  if ('waitUntil' in step) return `Wait until ${describeMoment(step.waitUntil)}`;
  if ('waitFor' in step) {
    const resets = (step.waitFor.resetOn ?? []).map((entry) =>
      typeof entry === 'string' ? entry : entry.event
    );
    const settle = step.waitFor.settleFor
      ? `, then ${describeDuration(step.waitFor.settleFor)} of quiet (restarted by ${resets.join(', ')})`
      : '';
    const waited = step.waitFor.event ?? (step.waitFor.events ?? []).map((entry) => entry.event).join(' or ');
    const ends = step.waitFor.endOn?.length
      ? `, ended by ${step.waitFor.endOn.map((entry) => entry.event).join(', ')}`
      : '';
    return `Wait for ${waited}${settle}${ends} ${describeTimeout(step.waitFor.timeout)}`;
  }
  if ('repeat' in step) {
    const until = step.repeat.until ? ' until it lands' : '';
    return `Every ${describeDuration(step.repeat.every)}, up to ${step.repeat.max} times${until}`;
  }
  if ('forEach' in step) {
    return `For each of ${step.forEach.items}, up to ${step.forEach.max}`;
  }
  if ('branch' in step) {
    const cases = Array.isArray(step.branch) ? step.branch : [];
    const names = cases.map((entry) => entry.name);
    if (!cases.some((entry) => entry.when === undefined)) names.push(FALLBACK_CASE);
    return `Cases: ${names.join(' · ')}`;
  }
  if ('fetch' in step) {
    const method = step.fetch.method ?? (step.fetch.body === undefined ? 'GET' : 'POST');
    return `${method} ${describeHost(step.fetch.url)}`;
  }
  if ('set' in step) {
    const target = 'attribute' in step.set ? `attribute ${step.set.attribute}` : `variable ${step.set.var}`;
    return `Set ${target} to ${value(step.set.value)}`;
  }
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
      icon: stepIcon(kind, step),
      summary: describeStep(step),
      depth,
      lane: index === 0 ? lane : null,
    });
    if ('branch' in step) {
      (Array.isArray(step.branch) ? step.branch : []).forEach((entry, caseIndex) => {
        rows.push(...flattenSteps(entry.steps, depth + 1, entry.name, `${key}.${caseIndex}.`));
      });
    }
    if ('repeat' in step) {
      rows.push(...flattenSteps(step.repeat.steps, depth + 1, null, `${key}.r.`));
    }
    if ('forEach' in step) {
      rows.push(...flattenSteps(step.forEach.steps, depth + 1, null, `${key}.e.`));
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
      const trigger = data.trigger as { name?: string; zone?: string } | undefined;
      const detail =
        trigger?.name === SCHEDULE_TRIGGER_NAME
          ? `on schedule${trigger.zone ? ` in ${trigger.zone.replace(/_/g, ' ')}` : ''}`
          : trigger?.name
            ? `on ${trigger.name}`
            : null;
      return { icon: 'IconPlayFilled', label: 'Started', detail };
    }
    case '$run.step': {
      const status = typeof data.status === 'string' ? data.status : 'running';
      const { icon } = STEP_STATUS_ICONS[status] ?? STEP_STATUS_ICONS.running!;
      return { icon, label: event.step ?? 'Step', detail: summary };
    }
    case '$run.completed':
      return { icon: 'IconCircleCheckFilled', label: 'Completed', detail: null };
    case '$run.canceled':
      return {
        icon: 'IconCircleBanSignFilled',
        label: 'Canceled',
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
      for (const entry of Array.isArray(step.branch) ? step.branch : []) stepsByName(entry.steps, into);
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
