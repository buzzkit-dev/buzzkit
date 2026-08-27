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
