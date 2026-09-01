import type { CountCondition, Duration, NeverCondition, RefCondition, Scalar } from 'buzzkit/expressions';
import type {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  FETCH_ERROR_MODES,
  FETCH_METHODS,
  INTERRUPTION_LEVELS,
  SEND_CHANNELS,
  SEND_POLICY_MODES,
  SEND_PRIORITIES,
  SINCE_ANCHORS,
  STEP_KINDS,
  TEMPLATE_FILTERS,
  TRIGGER_SOURCES,
} from './constants';

export type ConcurrencyMode = (typeof CONCURRENCY_MODES)[number];

export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export type StepKind = (typeof STEP_KINDS)[number];

export type FetchErrorMode = (typeof FETCH_ERROR_MODES)[number];

export type TemplateFilter = (typeof TEMPLATE_FILTERS)[number];

export type FetchTimeout = `${number}s`;

export type Since = (typeof SINCE_ANCHORS)[number];

export type RunCountCondition = CountCondition & { since?: Since };

export type OccurredCondition = { occurred: string; within?: Duration; since?: Since };

export type OpenedCondition = { opened: string };

export type DeliveredCondition = { delivered: string };

export type WorkflowCondition =
  | RefCondition
  | RunCountCondition
  | NeverCondition
  | OccurredCondition
  | OpenedCondition
  | DeliveredCondition;

export type WorkflowExpression =
  | { all: WorkflowExpression[] }
  | { any: WorkflowExpression[] }
  | { not: WorkflowExpression }
  | WorkflowCondition;

export type Moment = { delay?: Duration; time?: string; timezone?: string };

export type EventTrigger = { event: string; sources?: TriggerSource[]; where?: WorkflowExpression };

export type Schedule = { cron: string } | { daily: string };

export type ScheduleTrigger = {
  schedule: Schedule;
  timezone: string;
  segment?: string;
  where?: WorkflowExpression;
};

export type Trigger = EventTrigger | ScheduleTrigger;

export type EventMatcher = { event: string; where?: WorkflowExpression };

export type CancelRule = EventMatcher;

export type SendAction = {
  id: string;
  title: string;
  destructive?: boolean;
  foreground?: boolean;
  input?: boolean;
  placeholder?: string;
};

export type SendPayload = {
  channel?: (typeof SEND_CHANNELS)[number];
  topic?: string;
  title?: string;
  body?: string;
  subtitle?: string;
  data?: Record<string, unknown>;
  deliver?: (typeof DELIVERY_MODES)[number];
  skipIfSentWithin?: Duration;
  imageUrl?: string;
  sound?: string;
  badge?: number;
  threadId?: string;
  collapseId?: string;
  interruptionLevel?: (typeof INTERRUPTION_LEVELS)[number];
  relevanceScore?: number;
  priority?: (typeof SEND_PRIORITIES)[number];
  deepLink?: string;
  action?: { name: string; data?: Record<string, unknown> };
  actions?: SendAction[];
  policy?: (typeof SEND_POLICY_MODES)[number];
};

export type FetchMethod = (typeof FETCH_METHODS)[number];

export type FetchRequest = {
  method?: FetchMethod;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  timeout?: FetchTimeout;
  expect?: { status: number[] };
  as?: string;
  onError?: FetchErrorMode;
};

export type SetWrite = { attribute: string; value: Scalar } | { var: string; value: Scalar };

export type WaitStep = { name: string; wait: Duration };

export type WaitUntilStep = { name: string; waitUntil: Moment };

export type WaitForStep = {
  name: string;
  waitFor: {
    event?: string;
    events?: EventMatcher[];
    where?: WorkflowExpression;
    settleFor?: Duration;
    resetOn?: Array<string | EventMatcher>;
    endOn?: EventMatcher[];
    timeout: Duration | Moment;
  };
};

export type RepeatStep = {
  name: string;
  repeat: {
    steps: Step[];
    every: Duration;
    max: number;
    until?: WorkflowExpression;
  };
};

export type ForEachStep = {
  name: string;
  forEach: {
    items: string;
    as: string;
    max: number;
    steps: Step[];
  };
};

export type BranchCase = { name: string; when?: WorkflowExpression; steps: Step[] };

export type BranchStep = { name: string; branch: BranchCase[] };

export type FetchStep = { name: string; fetch: FetchRequest };

export type SetStep = { name: string; set: SetWrite };

export type SendStep = { name: string; send: SendPayload };

export type ExitStep = { exit: true };

export type Step =
  | WaitStep
  | WaitUntilStep
  | WaitForStep
  | RepeatStep
  | ForEachStep
  | BranchStep
  | FetchStep
  | SetStep
  | SendStep
  | ExitStep;

export type WorkflowSpec = {
  trigger: Trigger;
  concurrency?: ConcurrencyMode;
  cancelOn?: CancelRule[];
  defaultTimezone?: string;
  steps: Step[];
};

export type WorkflowIssue = { path: Array<string | number>; message: string };
