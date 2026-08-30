import type { ActorEventInput, ActorStepStatus } from '@buzzkit/api/actor/types';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';

export type RunParams = {
  runId: string;
  tenantId: number;
  subscriberId: number;
  externalId: string;
  workflowId: string;
  workflowSlug: string;
  versionId: string;
  spec: WorkflowSpec;
  trigger: {
    name: string;
    data: Record<string, unknown>;
    source: string;
    timestamp: string;
    sequence: number;
  };
  attributes: Record<string, unknown>;
  traceparent?: string;
  mode?: RunMode;
  assume?: Record<string, Assumption>;
};

export type RunMode = 'run' | 'test';

export type Assumption = { matched?: boolean; data?: unknown; status?: number };

export type TraceEntry = {
  step: string;
  status: StepStatus;
  summary: string;
  detail: Record<string, unknown> | null;
  at: string;
};

export type WaitPayload = { name: string; dataJson: string; timestamp: string; id: string };

export type StepOutcome = Record<string, unknown> & { at: string };

export type RunState = { steps: Record<string, StepOutcome>; vars: Record<string, unknown> };

export type StepStatus = ActorStepStatus;

export function toWaitPayload(event: ActorEventInput): WaitPayload {
  return { name: event.name, dataJson: JSON.stringify(event.data), timestamp: event.timestamp, id: event.id };
}
