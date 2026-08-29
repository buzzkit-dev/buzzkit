import type { WorkflowSpec } from 'buzzkit/workflows';

export type ActorIdentity = {
  tenantId: number;
  subscriberId: number;
  externalId: string;
};

export type ActorEventInput = {
  id: string;
  idempotencyKey: string | null;
  name: string;
  source: string;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  runId?: string | null;
  messageId?: string | null;
  step?: string | null;
};

export type ActorIngestInput = ActorIdentity & { events: ActorEventInput[]; traceparent?: string };

export type ActorIngestOutcome = { id: string; sequence: number; status: 'accepted' | 'duplicate' };

export type ActorEventRow = {
  sequence: number;
  id: string;
  idempotency_key: string | null;
  name: string;
  source: string;
  timestamp: string;
  received_at: string;
  data: string;
  run_id: string | null;
  message_id: string | null;
  step: string | null;
};

export type ActorProjection = {
  name: string;
  count: number;
  last_sequence: number;
  last_at: string;
};

export type ActorFlushOutcome = { flushed: number; batches: number; retryScheduled: boolean; pruned: number };

export type ActorRunStatus = 'running' | 'sleeping' | 'waiting' | 'completed' | 'cancelled' | 'failed';

export type ActorRunRow = {
  run_id: string;
  workflow_id: string;
  workflow_slug: string;
  version_id: string;
  status: ActorRunStatus;
  step: string | null;
  detail: string | null;
  trigger_sequence: number;
  started_at: string;
  updated_at: string;
};

export type ActorWaitRow = {
  run_id: string;
  step: string;
  event: string;
  condition: string | null;
  expires_at: string;
};

export type ActorStepRecord = {
  step: string;
  status: ActorRunStatus;
  summary: string;
  detail?: Record<string, unknown>;
};

export type ActorRunFinish = { status: 'completed' | 'failed'; error?: string; step?: string | null };

export type ActorDefinition = {
  id: string;
  slug: string;
  status: 'active' | 'paused';
  versionId: string;
  spec: WorkflowSpec;
};

export type ActorDefinitions = { version: number; workflows: ActorDefinition[] };
