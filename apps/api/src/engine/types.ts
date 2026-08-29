import type { ActorEventInput } from '@buzzkit/api/actor/types';
import type { WorkflowSpec } from 'buzzkit/workflows';

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
};

export type WaitPayload = { name: string; dataJson: string; timestamp: string; id: string };

export type StepOutcome = Record<string, unknown> & { at: string };

export type RunState = { steps: Record<string, StepOutcome> };

export type StepStatus = 'running' | 'sleeping' | 'waiting' | 'completed';

export function toWaitPayload(event: ActorEventInput): WaitPayload {
  return { name: event.name, dataJson: JSON.stringify(event.data), timestamp: event.timestamp, id: event.id };
}
