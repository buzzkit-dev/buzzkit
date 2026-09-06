import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { RUN_STATUSES } from './common';
import type { EventRecord } from './events';
import { listPage } from './list';

export type RunStatus = (typeof RUN_STATUSES)[number];

export type Run = {
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

export type RunDetail = Run & {
  events: EventRecord[];
};

export type RunCounts = {
  running: number;
  sleeping: number;
  waiting: number;
  steps: Record<string, number>;
};

export type ListRunsParams = PageParams & {
  status?: RunStatus;
  workflow?: string;
};

export function runsResource(transport: Transport) {
  return {
    list(params: ListRunsParams = {}): PagePromise<Run> {
      return listPage(transport, '/v1/runs', params);
    },

    retrieve(runId: string): Promise<RunDetail> {
      return transport.request({ method: 'GET', path: `/v1/runs/${encodeSegment(runId)}` });
    },
  };
}

export type RunsResource = ReturnType<typeof runsResource>;
