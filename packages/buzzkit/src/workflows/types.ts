import type { Duration, Expression } from '../expressions/types';
import type {
  CONCURRENCY_MODES,
  DELIVERY_MODES,
  SEND_CHANNELS,
  STEP_KINDS,
  TRIGGER_SOURCES,
} from './constants';

export type ConcurrencyMode = (typeof CONCURRENCY_MODES)[number];

export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export type StepKind = (typeof STEP_KINDS)[number];

export type Anchor = {
  after: 'trigger' | `steps.${string}`;
  plus?: Duration;
  at?: string;
  timezone?: string;
};

export type Trigger = { event: string; sources?: TriggerSource[]; where?: Expression };

export type CancelRule = { event: string; where?: Expression };

export type SendPayload = {
  channel?: (typeof SEND_CHANNELS)[number];
  topic?: string;
  title?: string;
  body?: string;
  subtitle?: string;
  data?: Record<string, unknown>;
  deliver?: (typeof DELIVERY_MODES)[number];
};

export type WaitStep = { name: string; wait: Duration };

export type WaitUntilStep = { name: string; waitUntil: Anchor };

export type WaitForStep = {
  name: string;
  waitFor: { event: string; where?: Expression; until: Anchor | Duration };
};

export type BranchStep = { name: string; branch: { if: Expression; then: Step[]; else?: Step[] } };

export type SendStep = { name: string; send: SendPayload };

export type ExitStep = { exit: true };

export type Step = WaitStep | WaitUntilStep | WaitForStep | BranchStep | SendStep | ExitStep;

export type WorkflowSpec = {
  trigger: Trigger;
  concurrency?: ConcurrencyMode;
  cancelOn?: CancelRule[];
  steps: Step[];
};

export type WorkflowIssue = { path: Array<string | number>; message: string };
