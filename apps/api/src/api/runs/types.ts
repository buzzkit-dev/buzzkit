import type { EventRecord } from '@buzzkit/api/api/events/index';
import type { RUN_STATUSES } from './constants';

export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunRow = {
  run_id: string;
  workflow_id: string;
  workflow: string;
  version_id: string;
  subscriber_id: number;
  external_id: string;
  status: string;
  step: string | null;
  summary: string;
  started_at: string;
  updated_at: string;
};

export type RunRecord = {
  id: string;
  workflowId: string;
  workflow: string;
  versionId: string;
  externalId: string;
  status: RunStatus;
  step: string | null;
  summary: string | null;
  startedAt: string;
  updatedAt: string;
};

export type RunDetail = RunRecord & { events: EventRecord[] };

export type RunCounts = { running: number; sleeping: number; waiting: number; steps: Record<string, number> };

export type RunCursor = { startedAt: string; id: string };

export type RunPage = { items: RunRecord[]; hasMore: boolean; nextCursor: string | null };

export type RunIdParts = { tenantId: number; workflowId: string; subscriberId: number; sequence: number };
