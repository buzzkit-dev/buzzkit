import type { PageParams, PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import { encodeSegment } from '../core/transport';
import type { WorkflowSpec as GrammarWorkflowSpec, TriggerSource } from '../workflows/index';
import type { Deleted, WORKFLOW_STATUSES } from './common';
import { listPage } from './list';
import type { Run, RunCounts, RunStatus } from './runs';

export type WorkflowSpec = GrammarWorkflowSpec;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowVersion = {
  id: string;
  number: number;
  publishedAt: string | null;
  createdAt: string;
};

export type Workflow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger: GrammarWorkflowSpec['trigger'];
  spec: WorkflowSpec;
  current: WorkflowVersion | null;
  draft: WorkflowVersion | null;
  versions?: Array<WorkflowVersion & { spec: WorkflowSpec }>;
  runs?: RunCounts;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowParams = {
  slug: string;
  name: string;
  description?: string | null;
  spec: WorkflowSpec;
};

export type UpdateWorkflowParams = {
  name?: string;
  description?: string | null;
  spec?: WorkflowSpec;
};

export type WorkflowScheduleFire = {
  firedAt: string;
  zones: string[];
  version: number;
  started: number;
  finishedAt: string | null;
};

export type WorkflowSchedule = {
  schedule: string;
  timezone: string;
  defaultTimezone: string;
  segment: string | null;
  next: Array<{ zone: string; at: string }>;
  fires: WorkflowScheduleFire[];
};

export type WorkflowStepTrace = {
  step: string;
  status: string;
  summary: string;
  detail: Record<string, unknown> | null;
  at: string;
};

export type TestWorkflowParams = {
  version?: number;
  externalId?: string;
  attributes?: Record<string, unknown>;
  event?: { name: string; data?: Record<string, unknown>; source?: TriggerSource };
  at?: string;
  assume?: Record<string, unknown>;
};

export type WorkflowTestResult = {
  version: number;
  trigger: { name: string; data: Record<string, unknown>; source: string };
  subscriber: string | null;
  outcome: 'completed' | 'failed';
  exited: boolean;
  error: string | null;
  step: string | null;
  path: string[];
  steps: WorkflowStepTrace[];
  vars: Record<string, unknown>;
  lint: unknown;
};

export type ListWorkflowRunsParams = PageParams & {
  status?: RunStatus;
};

export function workflowsResource(transport: Transport) {
  const base = (slug: string) => `/v1/workflows/${encodeSegment(slug)}`;

  return {
    list(): PagePromise<Workflow> {
      return listPage(transport, '/v1/workflows', {});
    },

    create(params: CreateWorkflowParams): Promise<Workflow> {
      return transport.request({ method: 'POST', path: '/v1/workflows', body: params });
    },

    retrieve(slug: string): Promise<Workflow> {
      return transport.request({ method: 'GET', path: base(slug) });
    },

    update(slug: string, params: UpdateWorkflowParams): Promise<Workflow> {
      return transport.request({ method: 'PATCH', path: base(slug), body: params });
    },

    remove(slug: string): Promise<Deleted<Workflow>> {
      return transport.request({ method: 'DELETE', path: base(slug) });
    },

    publish(slug: string): Promise<Workflow> {
      return transport.request({ method: 'POST', path: `${base(slug)}/publish` });
    },

    pause(slug: string): Promise<Workflow> {
      return transport.request({ method: 'POST', path: `${base(slug)}/pause` });
    },

    runs(slug: string, params: ListWorkflowRunsParams = {}): PagePromise<Run> {
      return listPage(transport, `${base(slug)}/runs`, params);
    },

    schedule(slug: string): Promise<WorkflowSchedule> {
      return transport.request({ method: 'GET', path: `${base(slug)}/schedule` });
    },

    test(slug: string, params: TestWorkflowParams = {}): Promise<WorkflowTestResult> {
      return transport.request({ method: 'POST', path: `${base(slug)}/test`, body: params });
    },
  };
}

export type WorkflowsResource = ReturnType<typeof workflowsResource>;
